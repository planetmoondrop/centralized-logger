# Moondrop axios interceptor

An Axios interceptor that automatically handles `x-loki-trace-id` headers. It reads the session ID from response headers, saves it (persistently if you provide a storage), and sends it back in all subsequent requests.

## Installation

```bash
# npm
npm install moondrop-axios-interceptor

# pnpm
pnpm add moondrop-axios-interceptor
```

## Usage

```bash
import axios from 'axios';
import { attachSessionInterceptor } from 'axios-session-interceptor';

const api = axios.create();

#  Attach the interceptor – session ID will be stored in memory
attachSessionInterceptor(api);
```

## With persistent storage (web)

```bash
import axios from 'axios';
import { attachSessionInterceptor } from 'axios-session-interceptor';

const api = axios.create();

#  Use localStorage for persistence
attachSessionInterceptor(api, {
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
});
```

## With React Native (AsyncStorage)

```bash
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { attachSessionInterceptor } from 'axios-session-interceptor';

const api = axios.create();

attachSessionInterceptor(api, {
  storage: {
    getItem: async (key) => await AsyncStorage.getItem(key),
    setItem: async (key, value) => await AsyncStorage.setItem(key, value),
  },
});
```
