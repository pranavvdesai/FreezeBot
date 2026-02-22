import { createApp } from './server';

const port = Number(process.env.PORT ?? 3000);

async function start() {
  const app = createApp();

  app.listen(port, () => {
    console.log(`bot-api listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start bot-api', error);
  process.exit(1);
});
