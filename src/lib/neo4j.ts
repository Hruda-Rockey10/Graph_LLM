import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getNeo4jDriver(): Driver {
  if (driver) {
    return driver;
  }

  const uri = getEnv("NEO4J_URI");
  const username = getEnv("NEO4J_USERNAME");
  const password = getEnv("NEO4J_PASSWORD");

  driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  return driver;
}

export async function runCypher<T = unknown>(
  cypher: string,
  params: Record<string, unknown> = {},
) {
  const db = process.env.NEO4J_DATABASE;
  const session = getNeo4jDriver().session(db ? { database: db } : {});
  try {
    const result = await session.run(cypher, params);
    return result as T;
  } finally {
    await session.close();
  }
}
