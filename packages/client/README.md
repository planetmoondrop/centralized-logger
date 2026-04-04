# @moondrop/logger-client

Axios interceptor for frontend apps that connects them to the `@moondrop/centralized-logger` trace chain.

Reads the `x-loki-trace-id` response header from any API response and injects it back into every subsequent request — so your frontend sessions appear as a continuous trace in Grafana alongside the backend logs.

## Installation

```bash
npm install @moondrop/logger-client axios
# or
pnpm add @moondrop/logger-client axios
```

## Basic usage

```ts
import axios from 'axios';
import { attachSessionInterceptor } from '@moondrop/logger-client';

const api = axios.create({ baseURL: 'https://api.example.com' });

// Attach once at app startup.
// Returns both interceptor IDs so you can eject later if needed.
const { requestId, responseId } = attachSessionInterceptor(api);
```

That's it. Every response that includes `x-loki-trace-id` stores the value, and every outgoing request includes it so the backend can correlate the call to an existing trace.

## Options

```ts
const ids = attachSessionInterceptor(api, {
  // Response header to read the trace ID from
  responseHeader: 'x-loki-trace-id', // default

  // Request header to inject the trace ID into
  requestHeader: 'x-loki-trace-id', // default

  // Key used to store the trace ID in the storage backend
  storageKey: 'sessionId', // default

  // Custom storage — defaults to MemoryStorage (in-process Map).
  // Provide any object that implements { getItem, setItem }.
  storage: myStorage,
});
```

## Custom storage

The default `MemoryStorage` keeps the trace ID in a `Map` — it works fine for a single-page session but clears on page reload. Provide your own storage to persist across reloads:

```ts
import { attachSessionInterceptor, SessionStorage } from '@moondrop/logger-client';

// Browser localStorage
const webStorage: SessionStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

attachSessionInterceptor(api, { storage: webStorage });
```

```ts
// React Native — AsyncStorage (async storage is fully supported)
import AsyncStorage from '@react-native-async-storage/async-storage';

attachSessionInterceptor(api, {
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  },
});
```

## Ejecting

```ts
const { requestId, responseId } = attachSessionInterceptor(api);

// Remove both interceptors (e.g. on logout)
api.interceptors.request.eject(requestId);
api.interceptors.response.eject(responseId);
```
