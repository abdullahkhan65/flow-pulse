export async function runSeed() {
  // No default seed data for now. Keep this entrypoint so npm scripts stay valid.
  console.log("No seed actions configured.");
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
