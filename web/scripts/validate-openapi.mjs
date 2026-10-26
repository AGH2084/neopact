import { readFileSync } from "node:fs";
// Read-only check that every JSON success response uses the named-resource envelope.

const file = process.argv[2];
try {
  if (!file) throw new Error("Missing OpenAPI input path");
  const schema = JSON.parse(readFileSync(file, "utf8"));
  if (
    !/^3\./.test(schema.openapi) ||
    !schema.paths ||
    !schema.components?.schemas
  ) {
    throw new Error(
      "Expected a standard OpenAPI 3 document with paths and schemas",
    );
  }
  const resolve = (value) => {
    if (!value?.$ref) return value;
    if (!value.$ref.startsWith("#/components/schemas/")) {
      throw new Error(`Unsupported response schema reference: ${value.$ref}`);
    }
    return schema.components.schemas[
      value.$ref.slice("#/components/schemas/".length)
    ];
  };
  let responses = 0;
  for (const [path, methods] of Object.entries(schema.paths)) {
    if (!path.startsWith("/api/v1/")) continue;
    for (const [method, operation] of Object.entries(methods)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      for (const [status, response] of Object.entries(
        operation.responses || {},
      )) {
        if (!/^2\d\d$/.test(status)) continue;
        const json = response.content?.["application/json"];
        if (!json) continue; // Successful image content is binary.
        const body = resolve(json.schema);
        const labels = Object.keys(body?.properties || {}).filter(
          (key) => key !== "status_code",
        );
        if (
          !body?.properties?.status_code ||
          labels.length !== 1 ||
          !body.required?.includes("status_code") ||
          !body.required.includes(labels[0])
        ) {
          throw new Error(
            `${method.toUpperCase()} ${path}: missing the named resource/status_code envelope`,
          );
        }
        const code = body.properties.status_code;
        if (code.const !== undefined && code.const !== Number(status)) {
          throw new Error(
            `${method.toUpperCase()} ${path}: envelope status does not match HTTP ${status}`,
          );
        }
        const payload = resolve(body.properties[labels[0]]);
        if (payload?.type !== "object") {
          throw new Error(
            `${method.toUpperCase()} ${path}: resource payload must be an object`,
          );
        }
        responses++;
      }
    }
  }
  if (!responses)
    throw new Error("No marketplace JSON response contracts found");
  process.stdout.write(
    `Validated ${responses} marketplace JSON response contracts.\n`,
  );
} catch (error) {
  process.stderr.write(`Invalid OpenAPI document: ${error.message}\n`);
  process.exitCode = 1;
}
