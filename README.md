# Synth

Synth is an Electron app that synthesizes data from connected apps (such as Slack) using artificial intelligence (DeepSeek and OpenAI). It presents insights and action items in a beautiful, modern UI that adapts to your operating system's color scheme.

## Features

- **Authentication**: Full user registration and login with Firebase
- **Slack Integration**: Connect your Slack workspace via OAuth
- **AI Synthesis**: Uses DeepSeek (with OpenAI as fallback) to analyze and synthesize data
- **Adaptive UI**: Automatically adjusts to light/dark mode based on OS settings
- **Modern Design**: Built with React and Tailwind CSS

## Prerequisites

- Node.js 14+
- npm or yarn
- A Firebase account and project
- A Slack app with appropriate permissions

## Setup and Installation

1. Clone the repository
2. Install dependencies:
```
npm install
```

3. Configure environment variables:
   The `.env` file should already contain the necessary configuration.

4. Start the development server:
```
npm run electron:dev
```

This will start both the React development server and the Electron app.

## Slack App Configuration

Your Slack app should have the following scopes:
- `channels:history`
- `channels:read`
- `chat:write`
- `groups:history`
- `groups:read`
- `im:history`
- `im:read`
- `mpim:history`
- `mpim:read`
- `users:read`

Configure your redirect URL in the Slack app settings to match the one in your `.env` file:
```
https://localhost:3001/slack/oauth/callback
```

## Building for Production

To build the app for production:
```
npm run electron:build
```

This will create distribution packages in the `dist` directory.

## Tech Stack

- **Frontend**: React, Tailwind CSS
- **Backend**: Node.js, Express (for the proxy server)
- **Desktop**: Electron
- **Authentication**: Firebase Authentication
- **Database**: Firestore
- **AI**: DeepSeek API, OpenAI API
- **API Integration**: Slack SDK

## Project Structure

```
synth/
├── public/                # Public assets and Electron main process
│   ├── electron.js        # Electron main process
│   └── preload.js         # Preload script for IPC
├── server/                # Proxy server for Slack API calls
│   └── server.js          # Express server
├── src/
│   ├── components/        # Reusable UI components
│   ├── contexts/          # React contexts (auth, theme)
│   ├── pages/             # Page components
│   ├── services/          # Service modules for API interactions
│   ├── App.js             # Main React component
│   └── index.js           # React entry point
├── .env                   # Environment variables
└── package.json           # Project dependencies and scripts
```

## License

MIT
