import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SourceTextModule } from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function listFiles(directory, suffix) {
    const files = [];
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(entryPath, suffix));
        } else if (entry.isFile() && entry.name.endsWith(suffix)) {
            files.push(entryPath);
        }
    }

    return files;
}

const sourceFiles = [
    ...await listFiles(path.join(root, "js"), ".js"),
    ...await listFiles(path.join(root, "scripts"), ".mjs"),
    path.join(root, "firebase-config.example.js")
];

for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    new SourceTextModule(source, { identifier: file });
}

const distDirectory = path.join(root, "dist");
const distFiles = await listFiles(distDirectory, ".js");
const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g;

for (const file of distFiles) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
        const target = path.resolve(path.dirname(file), match[1]);
        try {
            const details = await stat(target);
            if (!details.isFile()) throw new Error("not a file");
        } catch {
            throw new Error(`Missing local import ${match[1]} from ${path.relative(root, file)}`);
        }
    }
}

const indexSource = await readFile(path.join(distDirectory, "index.html"), "utf8");
const moduleScriptPattern = /<script[^>]+type=["']module["'][^>]+src=["'](\.{1,2}\/[^"']+)["'][^>]*>/g;
for (const match of indexSource.matchAll(moduleScriptPattern)) {
    const target = path.resolve(distDirectory, match[1]);
    const details = await stat(target);
    if (!details.isFile()) {
        throw new Error(`Missing module entry point ${match[1]} from dist/index.html`);
    }
}

console.log(`Verified ${sourceFiles.length} source files and ${distFiles.length} built modules.`);
