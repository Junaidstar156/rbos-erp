import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const requiredVariables = [
    "RBOS_DEPLOY_ENV",
    "RBOS_EXPECTED_FIREBASE_PROJECT_ID",
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID"
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());
if (missingVariables.length > 0) {
    throw new Error(`Missing required build variables: ${missingVariables.join(", ")}`);
}

const deploymentEnvironment = process.env.RBOS_DEPLOY_ENV.trim().toLowerCase();
if (!new Set(["local", "staging", "production"]).has(deploymentEnvironment)) {
    throw new Error("RBOS_DEPLOY_ENV must be local, staging, or production.");
}

const expectedProjectId = process.env.RBOS_EXPECTED_FIREBASE_PROJECT_ID.trim();
const actualProjectId = process.env.FIREBASE_PROJECT_ID.trim();
if (actualProjectId !== expectedProjectId) {
    throw new Error("FIREBASE_PROJECT_ID does not match RBOS_EXPECTED_FIREBASE_PROJECT_ID.");
}

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY.trim(),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN.trim(),
    projectId: actualProjectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET.trim(),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID.trim(),
    appId: process.env.FIREBASE_APP_ID.trim()
};

const relativeDist = path.relative(root, dist);
if (!relativeDist || relativeDist.startsWith("..") || path.isAbsolute(relativeDist)) {
    throw new Error("Refusing to clean a build directory outside the repository.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "js"), { recursive: true });
await cp(path.join(root, "Index.html"), path.join(dist, "index.html"));

async function copyJavaScriptTree(sourceDirectory, targetDirectory) {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const sourcePath = path.join(sourceDirectory, entry.name);
        const targetPath = path.join(targetDirectory, entry.name);

        if (entry.isDirectory()) {
            await mkdir(targetPath, { recursive: true });
            await copyJavaScriptTree(sourcePath, targetPath);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            await cp(sourcePath, targetPath);
        }
    }
}

await copyJavaScriptTree(path.join(root, "js"), path.join(dist, "js"));

const generatedConfig = [
    "// Generated at build time. Do not edit or commit this file.",
    `export const deploymentEnvironment = ${JSON.stringify(deploymentEnvironment)};`,
    `export const firebaseConfig = Object.freeze(${JSON.stringify(firebaseConfig, null, 4)});`,
    ""
].join("\n");

await writeFile(path.join(dist, "firebase-config.js"), generatedConfig, "utf8");
console.log(`Built RBOS ERP for ${deploymentEnvironment}.`);
