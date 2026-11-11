import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "attendance reminders",
  { minutes: 10 },
  internal.notifications.checkAttendanceReminders,
  {},
);

export default crons;
