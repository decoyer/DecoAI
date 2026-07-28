# DecoAI
AI chat customization browser extension with *Plasmo*

using *Google Authentication*

## Details
<p align="center">
  <img src="https://github.com/user-attachments/assets/0be99fbb-313b-44b1-91b6-f584a59be77e" alt="main">
</p>

### <div align="center">Decorate Your AI Chat</div>

## Key Features
- ```AI chat theme customization```
- ```Custom theme presets```
- ```Resizable chat widgets```
- ```Animated backgrounds and stickers```
- ```AI-assisted color matching```
- ```Image background removal```
- ```AI chat directly in the sidebar```
- ```Google sign-in and Pro access control```
- ```Chrome, Edge, and Whale support```

## Supported Services
- [x] ChatGPT
- [x] Gemini
- [x] Claude
- [x] Grok

## Getting Started
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) &ensp;
![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=for-the-badge&logo=typescript&logoColor=white) &ensp;
![Plasmo](https://img.shields.io/badge/plasmo-%237c3aed.svg?style=for-the-badge&logo=googlechrome&logoColor=white)

```INI
# Install dependencies
npm install

# Create a production build
npm run build
```
Load `build/chrome-mv3-prod` as an unpacked extension in a Chromium-based browser.

## Requirements
```INI
# Runtime
Node.js
npm
Chromium-based browser

# Extension services
Firebase project
Google OAuth client
```

- *Firebase project*
  - Used for ```Google Authentication``` and Pro status verification.
- *Google OAuth client*
  - Required for Chrome extension sign-in through ```chrome.identity```.

## Tasks
- [ ] Improve cross-device sync stability
- [ ] Add more Pro-only customization tools