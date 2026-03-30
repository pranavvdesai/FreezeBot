import { createArchiveStore } from './index';

async function main() {
  const store = await createArchiveStore();
  const appliedMigrations = await store.ensureMigrations();

  for (const migration of appliedMigrations) {
    console.log(`${migration.id} ${migration.appliedAt}`);
  }

  await store.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
