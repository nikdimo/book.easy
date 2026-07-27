# Property host mobile workspace

Working-name Expo/React Native host application for the existing property platform.
The product name, bundle identifiers, and store metadata can be changed later without
changing the property, booking, calendar, notification, or chat domain contracts.
The same project runs on iOS, Android, and in a browser for control-panel testing.

## Local web preview

1. Run the main Next.js app from the repository root with `npm run dev`.
2. Run the route-aware mobile web preview with `npm run mobile:preview`.
3. Open `http://localhost:8081`, or open `http://localhost:3000/host/mobile`
   for the control-panel launch instructions.

On Windows, `BookEasy_Mobile_Preview.bat` starts both processes.

The browser preview reuses the authenticated Next.js host session. Google and email-link
login use the existing Auth.js providers.

For a production web preview, set `MOBILE_WEB_ORIGIN` on the Next.js server to the exact
mobile web origin. Multiple allowed origins can be comma-separated.

Native token exchange and secure-device session storage are isolated behind
`src/context/auth-context.tsx`; the browser preview uses the shared host session so it
can be tested immediately.
