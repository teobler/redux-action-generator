import * as fs from "fs";
import { DefinitionsResolver } from "./DefinitionsResolver";
import * as path from "path";
import { prettifyCode, testJSON } from "./utils";
import { PathResolver } from "./PathResolver";
import axios from "axios";
import { map } from "lodash";
import { Spec } from "swagger-schema-official";
import { ERROR_MESSAGES } from "./constants";

const codegenConfigPath = path.resolve("ts-codegen.config.json");

const getCodegenConfig = () =>
  fs.existsSync(codegenConfigPath)
    ? require(codegenConfigPath)
    : {
        output: ".output",
        actionCreatorImport: "",
        clients: [],
      };

const { output, actionCreatorImport, timeout, data, clients } = getCodegenConfig();

const codegen = (schema: Spec | string) => {
  if (typeof schema === "string") {
    console.error(ERROR_MESSAGES.INVALID_JSON_FILE_ERROR);
    return;
  }

  if (!fs.existsSync(output)) {
    fs.mkdirSync(output);
  }

  const fileStr =
    actionCreatorImport +
    [
      ...PathResolver.of(schema.paths, schema.basePath)
        .resolve()
        .toRequest(),
      ...DefinitionsResolver.of(schema.definitions)
        .scanDefinitions()
        .toDeclarations(),
    ].join("\n\n");

  const getFilename = (basePath?: string) => (basePath ? basePath.split("/").join(".") : "request");

  fs.writeFileSync(
    path.resolve(output, `./${getFilename(schema.basePath).slice(1)}.ts`),
    prettifyCode(fileStr),
    "utf-8",
  );
};

(data || []).map((file: string) => {
  const schemaStr = fs.readFileSync(file, "utf8");
  const schema = testJSON(schemaStr);

  if (schema) {
    codegen(schema);
  }
});

if (clients) {
  const instance = axios.create({
    timeout: timeout || 10 * 1000,
  });

  map(clients, (client) => {
    instance
      .get(client)
      .then((response) => {
        codegen(response.data);
      })
      .catch((error) => {
        console.error(`${error.code}: ${ERROR_MESSAGES.FETCH_CLIENT_FAILED_ERROR}`);
      });
  });
}
