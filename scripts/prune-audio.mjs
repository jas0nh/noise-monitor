import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruneAudio } from "../lib/audio-retention.mjs";
import { openDatabase } from "../lib/database.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const database=openDatabase(process.env.NOISE_DB_PATH||path.join(root,"data","noise.sqlite"));
try{console.log(JSON.stringify(await pruneAudio(database,root),null,2));}finally{database.close()}
