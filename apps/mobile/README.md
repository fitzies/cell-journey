# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Leader event tabs

Leader navigation defaults to five tabs: Home, Events, Attendance,
Members, Profile. Existing co-leader capability checks still apply to Members.
Member-mode navigation is unchanged. Events reuses the existing cards,
menus and create/edit/import flows. Split-mode Events hides the Upcoming heading/count and vertically centers card content.
Its cards do not open on tap and omit
attendance status text, while retaining permitted long-press edit/delete actions.
Combined Events keeps its original clickable cards, status text, and zoom behavior.
The new attendance list
shows ongoing and past events, including completed records, with a right-aligned
button opening the existing attendance detail screen.

The Convex `appConfig` table has one record with `key: "mobile"` and
`leaderEventsLayout: "split" | "combined"`. No record means `split`.
Use the internal mutation in the Convex dashboard, or from the repository root:

```sh
# Configured development deployment:
pnpm exec convex run appConfig:setLeaderEventsLayout '{"layout":"combined"}'
pnpm exec convex run appConfig:setLeaderEventsLayout '{"layout":"split"}'
```

The dashboard mutation takes `{ "layout": "split" }` or
`{ "layout": "combined" }` and updates the singleton record. It is internal,
so mobile users cannot call it. A future admin-dashboard control must enforce
admin authorization before invoking it. No admin UI is added by this change.

The app captures this setting once when leader access first loads in a fresh
JS/app session. Fully close/relaunch the app, or reload Expo, after changing it.
Opening another tab, switching groups/modes, or backgrounding and resuming does
not replace navigation while someone may have an attendance draft open.

Deploy the backend additions before shipping the supporting mobile build. Once
that build is installed, either layout can be selected without another binary.
Older builds do not understand the setting. Production uses its own config;
select the production deployment deliberately when changing its record.
