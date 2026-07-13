# RBOS ERP staging deployment

This repository builds a static `dist/` site and generates its public Firebase web configuration from deployment environment variables. Generated configuration and local environment files are intentionally excluded from Git.

## Required build variables

- `RBOS_DEPLOY_ENV`
- `RBOS_EXPECTED_FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

For the staging Netlify site, set `RBOS_DEPLOY_ENV` to `staging`. Set `RBOS_EXPECTED_FIREBASE_PROJECT_ID` and `FIREBASE_PROJECT_ID` to the same staging project ID. The build fails if they differ, which prevents an accidental project mismatch.

Firebase web configuration is public project-identifying configuration. Never add service-account JSON, private keys, Admin SDK credentials, passwords, or test-user credentials to frontend variables or this repository.

## Build and verify

Use Node.js 20 or newer. Populate the required environment variables in the shell or deployment platform, then run:

```text
npm run build
npm run verify
```

Netlify reads `netlify.toml`, runs `npm run build`, and publishes `dist`. The staging site is marked `noindex`, and the generated Firebase configuration is served with `no-store` caching.

## Netlify staging settings

- Repository: `Junaidstar156/rbos-erp`
- Branch: the approved staging configuration branch until it is merged, then `main`
- Build command: `npm run build`
- Publish directory: `dist`
- Required variables: use only the staging Firebase web app values listed above

Before deploying, verify the Netlify project is the dedicated staging site and that both project-ID variables name the staging Firebase project. Do not copy or promote the staging deploy to a production site.

## Firestore rules deployment

`.firebaserc` defines only the `staging` alias and deliberately has no default or production target. Authenticate the Firebase CLI with an account authorized for the staging project, inspect the active project, and deploy only the reviewed rules:

```text
firebase use staging
firebase deploy --only firestore:rules --project staging
```

Rules deployment is a separate approval-controlled action. Do not weaken rules, deploy to another project, or add a production alias during staging setup.
