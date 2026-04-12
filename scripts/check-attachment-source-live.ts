const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";
const TARGET_PROPERTY_NAMES = ["출처", "업로드 출처"] as const;

type TargetPropertyName = (typeof TARGET_PROPERTY_NAMES)[number];

type NotionOption = {
  name?: string;
};

type NotionDatabaseProperty = {
  type?: string;
  select?: {
    options?: NotionOption[];
  };
  multi_select?: {
    options?: NotionOption[];
  };
  status?: {
    options?: NotionOption[];
  };
};

type NotionDatabaseResponse = {
  properties?: Record<string, NotionDatabaseProperty>;
};

function getRequiredEnv(name: "NOTION_TOKEN" | "NOTION_ATTACHMENT_DB_ID") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_API_VERSION
  };
}

function readOptions(property: NotionDatabaseProperty) {
  switch (property.type) {
    case "select":
      return property.select?.options?.map((option) => option.name ?? "").filter(Boolean) ?? [];
    case "multi_select":
      return (
        property.multi_select?.options?.map((option) => option.name ?? "").filter(Boolean) ?? []
      );
    case "status":
      return property.status?.options?.map((option) => option.name ?? "").filter(Boolean) ?? [];
    default:
      return [];
  }
}

function printPropertyResult(
  propertyName: TargetPropertyName,
  property: NotionDatabaseProperty | undefined
) {
  if (!property?.type) {
    console.log(`${propertyName}: 없음`);
    return false;
  }

  console.log(`${propertyName}: 있음`);
  console.log(`- type: ${property.type}`);

  const options = readOptions(property);
  if (options.length > 0) {
    console.log(`- options: ${options.join(", ")}`);
  } else if (
    property.type === "select" ||
    property.type === "multi_select" ||
    property.type === "status"
  ) {
    console.log("- options: 없음");
  }

  return true;
}

async function run() {
  const token = getRequiredEnv("NOTION_TOKEN");
  const databaseId = getRequiredEnv("NOTION_ATTACHMENT_DB_ID");

  const response = await fetch(`${NOTION_API_BASE_URL}/databases/${databaseId}`, {
    method: "GET",
    headers: getHeaders(token)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion database retrieve failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as NotionDatabaseResponse;
  const properties = data.properties ?? {};

  let foundAny = false;
  for (const propertyName of TARGET_PROPERTY_NAMES) {
    const found = printPropertyResult(propertyName, properties[propertyName]);
    foundAny = foundAny || found;
  }

  if (!foundAny) {
    console.log("결론: 두 속성 모두 없음");
  }
}

run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown error while checking attachment source schema"
  );
  process.exit(1);
});
