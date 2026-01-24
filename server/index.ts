import { createApp } from "./app";

const port = Number(process.env.PORT) || 8787;
const app = createApp();

app.listen(port, () => {
  console.log(`API server listening on ${port}`);
});

