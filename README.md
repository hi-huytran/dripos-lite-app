# Dripos Lite — Mobile App

Dripos Lite mobile app, a phone-first POS for cash checkout, built with Expo Router, React Native, and TypeScript.

## Setup

**Prerequisites**
- Node.js
- [Expo Go](https://expo.dev/go) on a physical device — or an iOS Simulator / Android emulator if you have one set up

**Run it**

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` (iOS Simulator) / `a` (Android emulator) in the terminal.

No custom native modules are used, so this runs entirely inside Expo Go — no dev client or native build required.

## Backend URL Configuration

`API_BASE_URL` is set at [`lib/api.ts:1`](lib/api.ts#L1):

```ts
const API_BASE_URL = 'https://dripos-lite-backend-production.up.railway.app';
```

It's currently pointed at the live deployed backend. **No local backend setup is required** — the app works out of the box against that instance.

## Features Implemented

- Product browsing (menu list + detail)
- Single-select modifier customization, with required modifier groups enforced before adding to cart
- Cart — add items, adjust quantity, remove lines
- Checkout — cash only; other payment methods are shown but disabled
- Receipt after a completed order
- Tickets list (newest first) and ticket detail view

## Notes / Tradeoffs

- The cart lives only in local app state (React Context) — it isn't persisted server-side, and is submitted to the backend once, at checkout.
- Payment method isn't stored server-side as a separate field, since cash is the only payment method implemented for this exercise.
