# DecoAI
AI chat customization browser extension with *Plasmo*

using *Google Authentication*

## Details
![mainpage](https://github.com/user-attachments/assets/0be99fbb-313b-44b1-91b6-f584a59be77e)

### <div align="center">Decorate Your AI Chat</div>

## Key Features
- ```AI chat theme customization```
- ```Custom theme presets```
- ```Resizable chat widgets```
- ```Animated backgrounds and stickers```
- ```AI-assisted color matching```
- ```Image background removal```
- ```Google sign-in and Pro access control```
- ```Chrome, Edge, and Whale support```

## Pro Features
- ```Unlimited Theme Presets & Widgets```
- ```Animated Images Support```
- ```Cross-Device Sync```
- ```AI-Powered Customization (Beta)```

## Getting Started
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) &ensp;
![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=for-the-badge&logo=typescript&logoColor=white) &ensp;
![Plasmo](https://img.shields.io/badge/plasmo-%237c3aed.svg?style=for-the-badge&logo=googlechrome&logoColor=white) &ensp;
![Firebase](https://img.shields.io/badge/firebase-%23FFCA28.svg?style=for-the-badge&logo=firebase&logoColor=black)

```INI
# Install dependencies
npm install

# Create a production build
npm run build
```

Load the generated Plasmo build directory as an unpacked extension in a Chromium-based browser.

## Supported Services
- ```ChatGPT```
- ```Gemini```
- ```Claude```
- ```Grok```

## Requirements
```INI
# Runtime
Node.js
npm
Chromium-based browser

# Extension services
Firebase project
Google OAuth client
Background removal API access
```

- *Firebase project*
  - Used for Google authentication and Pro status verification.
- *Google OAuth client*
  - Required for Chrome extension sign-in through ```chrome.identity```.json```.
- *Background removal API access*
  - Used by the Remove BG feature.
  - The current implementation calls the background removal endpoint from the extension background script.

## Tasks
- [ ] Enable account-level backup and restore
- [ ] Improve cross-device sync stability
- [ ] Add more Pro-only customization tools
