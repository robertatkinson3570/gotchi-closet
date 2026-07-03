import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/state/useAppStore";
import type { EditorInstance, Gotchi } from "@/types";

const g = (id: string, equipped: number[] = [0, 0, 0, 0, 0, 0, 0, 0]): Gotchi =>
  ({ id, name: `G${id}`, numericTraits: [], equippedWearables: equipped } as unknown as Gotchi);

const inst = (instanceId: string, gotchi: Gotchi): EditorInstance => ({
  instanceId,
  baseGotchi: gotchi,
  equippedBySlot: [0, 0, 0, 0, 0, 0, 0, 0],
});

const slots = (instanceId: string): number[] =>
  useAppStore.getState().editorInstances.find((i) => i.instanceId === instanceId)!
    .equippedBySlot;

beforeEach(() => {
  useAppStore.setState({
    gotchis: [],
    manualGotchis: [],
    editorInstances: [],
    lockedById: {},
    overridesById: {},
    walletItemCounts: {},
    loadedAddress: null,
  });
});

describe("equip count enforcement (audit M4)", () => {
  it("rejects equipping a second copy the user doesn't own (both hands, 1 owned)", () => {
    const gotchi = g("1");
    useAppStore.setState({
      gotchis: [gotchi],
      editorInstances: [inst("A", gotchi)],
      walletItemCounts: { 77: 1 },
    });
    expect(useAppStore.getState().equipWearable("A", 77, 4)).toBe(true);
    expect(slots("A")[4]).toBe(77);
    expect(useAppStore.getState().equipWearable("A", 77, 5)).toBe(false);
    expect(slots("A")[5]).toBe(0);
    expect(slots("A")[4]).toBe(77); // first copy untouched
  });

  it("allows both hands with 2 owned", () => {
    const gotchi = g("1");
    useAppStore.setState({
      gotchis: [gotchi],
      editorInstances: [inst("A", gotchi)],
      walletItemCounts: { 77: 2 },
    });
    expect(useAppStore.getState().equipWearable("A", 77, 4)).toBe(true);
    expect(useAppStore.getState().equipWearable("A", 77, 5)).toBe(true);
    expect(slots("A")[4]).toBe(77);
    expect(slots("A")[5]).toBe(77);
  });

  it("moving the same copy between slots of one instance is free", () => {
    const gotchi = g("1");
    useAppStore.setState({
      gotchis: [gotchi],
      editorInstances: [inst("A", gotchi)],
      walletItemCounts: { 77: 1 },
    });
    expect(useAppStore.getState().equipWearable("A", 77, 0)).toBe(true);
    expect(useAppStore.getState().equipWearable("A", 77, 2)).toBe(true);
    expect(slots("A")[0]).toBe(0); // vacated by the move
    expect(slots("A")[2]).toBe(77);
  });

  it("blocks a second instance from using the only owned copy", () => {
    const g1 = g("1");
    const g2 = g("2");
    useAppStore.setState({
      gotchis: [g1, g2],
      editorInstances: [inst("A", g1), inst("B", g2)],
      walletItemCounts: { 77: 1 },
    });
    expect(useAppStore.getState().equipWearable("A", 77, 0)).toBe(true);
    expect(useAppStore.getState().equipWearable("B", 77, 0)).toBe(false);
    expect(slots("B")[0]).toBe(0);
  });

  it("un-owned wearables still equip freely (simulation mode)", () => {
    const gotchi = g("1");
    useAppStore.setState({
      gotchis: [gotchi],
      editorInstances: [inst("A", gotchi)],
      walletItemCounts: {},
    });
    expect(useAppStore.getState().equipWearable("A", 88, 0)).toBe(true);
    expect(slots("A")[0]).toBe(88);
  });
});
