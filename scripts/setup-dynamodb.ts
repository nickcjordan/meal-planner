import { createTableIfNotExists } from "@meal-planner/db";

const tableName = process.argv.includes("--table-name")
  ? process.argv[process.argv.indexOf("--table-name") + 1]
  : (process.env.DYNAMODB_TABLE_NAME ?? "meal-planner-dev");

const region = process.env.AWS_REGION ?? "us-east-1";

async function main() {
  console.log(`Setting up DynamoDB table "${tableName}" in ${region}...`);

  const created = await createTableIfNotExists({ tableName, region });

  if (created) {
    console.log(`Table "${tableName}" created successfully.`);
  } else {
    console.log(`Table "${tableName}" already exists. No changes made.`);
  }
}

main().catch((err) => {
  console.error("Failed to set up DynamoDB table:", err);
  process.exit(1);
});
