#!/usr/bin/env python3
"""ingest-youtube: pull a YouTube channel's caption transcripts into a
DiscordChatExporter-format JSON file that gotchi-kb build() can index.

One yt-dlp pass per video grabs the json3 auto/manual captions AND the
info.json metadata (date/title); transcript text is a straight concat of
json3 segs (verified byte-identical to youtube-transcript-api output).

  python ingest-youtube.py main      # @aavegotchi channel  -> ytav file
  python ingest-youtube.py dao        # AavegotchiDAO channel -> daocall file (DAO calls)
  python ingest-youtube.py both
  python ingest-youtube.py <src> --parse-only   # rebuild JSON from cache, no downloads

Cache (resumable) lives under C:/tmp/yt-cache/<src>/. Re-running skips
videos already downloaded (yt-dlp --no-overwrites).
"""
import json, os, re, subprocess, sys, glob

ROOT = os.environ.get("GOTCHI_KB_ROOT", "C:/tools/dce").replace("\\", "/")
CACHE = "C:/tmp/yt-cache"
CHUNK = 1400

SOURCES = {
    "main": dict(
        urls=["https://www.youtube.com/@aavegotchi/videos",
              "https://www.youtube.com/@aavegotchi/streams"],
        chId="aavegotchi-youtube", chName="aavegotchi-youtube",
        cat="Aavegotchi YouTube (captions)", prefix="ytav",
        out=ROOT + "/exports/aavegotchi-web/Aavegotchi YouTube [ytav].json",
    ),
    "dao": dict(
        urls=["https://www.youtube.com/channel/UCd--rwdOVm8264cbdSGvr8g/videos",
              "https://www.youtube.com/channel/UCd--rwdOVm8264cbdSGvr8g/streams"],
        chId="dao-call-transcripts", chName="dao-call-transcripts",
        cat="DAO Calls (YouTube auto-captions)", prefix="daocall",
        out=ROOT + "/exports/aavegotchi-forum-dao/Aavegotchi - DAO Call Transcripts (YouTube) [daocall].json",
    ),
}


def yt(args):
    return subprocess.run([sys.executable, "-m", "yt_dlp", *args],
                          capture_output=True, text=True, encoding="utf-8", errors="replace")


def enumerate_ids(urls):
    ids = {}
    for u in urls:
        r = yt(["--flat-playlist", "--no-warnings", "--print", "%(id)s|%(title)s", u])
        for line in r.stdout.splitlines():
            if "|" in line:
                vid, title = line.split("|", 1)
                if vid.strip():
                    ids.setdefault(vid.strip(), title.strip())
    return ids


def download(src, ids):
    d = f"{CACHE}/{src}"
    os.makedirs(d, exist_ok=True)
    batch = f"{d}/_urls.txt"
    with open(batch, "w", encoding="utf-8") as f:
        for vid in ids:
            f.write(f"https://www.youtube.com/watch?v={vid}\n")
    print(f"[{src}] downloading captions+meta for {len(ids)} videos -> {d}", flush=True)
    yt(["-a", batch, "--skip-download", "--write-auto-subs", "--write-subs",
        "--sub-langs", "en.*,en", "--sub-format", "json3", "--write-info-json",
        "--no-overwrites", "--ignore-errors", "--no-warnings",
        "--sleep-requests", "1", "--retries", "3",
        "-o", d + "/%(id)s.%(ext)s"])


def transcript_for(d, vid):
    js = sorted(glob.glob(f"{d}/{vid}*.json3"),
                key=lambda p: (".en." not in p, -os.path.getsize(p)))
    if not js:
        return ""
    try:
        data = json.load(open(js[0], encoding="utf-8"))
    except Exception:
        return ""
    parts = []
    for ev in data.get("events", []):
        segs = ev.get("segs")
        if not segs:
            continue
        t = "".join(s.get("utf8", "") for s in segs)
        if t.strip():
            parts.append(t.replace("\n", " ").strip())
    return " ".join(" ".join(parts).split())


def chunk(text, mx=CHUNK):
    out, i = [], 0
    while i < len(text):
        end = min(i + mx, len(text))
        if end < len(text):
            sl = text[i:end]
            cut = max(sl.rfind(". "), sl.rfind("? "), sl.rfind("! "))
            if cut > mx * 0.5:
                end = i + cut + 1
        out.append(text[i:end].strip())
        i = end
    return [c for c in out if c]


def short_title(title):
    t = re.sub(r"^(Aavegotchi\s+)?(Hangout|DAO Call|Hangout\s*[/+]\s*DAO Call|DAO Community Call)\s*[:\-]?\s*", "", title, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" :-")
    return (t or title)[:50]


def iso(upload_date):
    if upload_date and len(upload_date) == 8 and upload_date.isdigit():
        return f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}T12:00:00.000+00:00"
    return "2023-01-01T12:00:00.000+00:00"


def build(src, parse_only=False):
    cfg = SOURCES[src]
    d = f"{CACHE}/{src}"
    if parse_only:
        infos = glob.glob(f"{d}/*.info.json")
        ids = {}
        for p in infos:
            try:
                j = json.load(open(p, encoding="utf-8"))
                ids[j["id"]] = j.get("title", j["id"])
            except Exception:
                pass
    else:
        ids = enumerate_ids(cfg["urls"])
        print(f"[{src}] enumerated {len(ids)} videos", flush=True)
        download(src, ids)

    messages = []
    have, notext = 0, 0
    for vid, title in ids.items():
        info_p = f"{d}/{vid}.info.json"
        upload, real_title = "", title
        if os.path.exists(info_p):
            try:
                j = json.load(open(info_p, encoding="utf-8"))
                upload = j.get("upload_date") or ""
                real_title = j.get("title") or title
            except Exception:
                pass
        text = transcript_for(d, vid)
        if len(text) < 60:
            notext += 1
            continue
        ts = iso(upload)
        md = (upload[4:6] + "-" + upload[6:8] + " ") if len(upload) == 8 else ""
        author = (md + short_title(real_title)).strip()
        for idx, c in enumerate(chunk(text)):
            messages.append({
                "id": f"{cfg['prefix']}-{vid}-{idx}", "type": "Default", "timestamp": ts,
                "content": c, "author": {"name": author, "nickname": author},
                "attachments": [{"url": f"https://youtu.be/{vid}"}],
            })
        have += 1
    messages.sort(key=lambda m: m["timestamp"], reverse=True)
    doc = {"guild": {"id": "aavegotchi", "name": "Aavegotchi"},
           "channel": {"id": cfg["chId"], "name": cfg["chName"], "category": cfg["cat"]},
           "messages": messages}
    os.makedirs(os.path.dirname(cfg["out"]), exist_ok=True)
    json.dump(doc, open(cfg["out"], "w", encoding="utf-8"), ensure_ascii=False)
    print(f"[{src}] videos with transcript: {have}, no/blank captions: {notext}, "
          f"messages: {len(messages)}\n-> {cfg['out']}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("main", "dao", "both"):
        print("usage: python ingest-youtube.py <main|dao|both> [--parse-only]")
        sys.exit(1)
    parse_only = "--parse-only" in sys.argv
    targets = ["main", "dao"] if sys.argv[1] == "both" else [sys.argv[1]]
    for s in targets:
        build(s, parse_only=parse_only)
