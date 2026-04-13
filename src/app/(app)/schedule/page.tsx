"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";

// Dummy events
const EVENTS = [
  {
    type: "cell" as const,
    title: "Cell Group Meeting",
    date: new Date(2025, 3, 18),
    dayOfWeek: "Fri",
    time: "8:00 PM",
    venue: "Block 42 Community Lounge",
    badge: "Next",
  },
  {
    type: "special" as const,
    title: "Easter Celebration",
    date: new Date(2025, 3, 26),
    dayOfWeek: "Sat",
    time: "10:00 AM – 1:00 PM",
    venue: "Grace Sanctuary Hall",
    badge: "Special",
  },
  {
    type: "cell" as const,
    title: "Cell Group Meeting",
    date: new Date(2025, 4, 2),
    month: "May",
    dayOfWeek: "Fri",
    time: "8:00 PM",
    venue: "Block 42 Community Lounge",
    badge: "3 wks",
  },
  {
    type: "rest" as const,
    title: "Rest week — no meeting",
    date: new Date(2025, 4, 9),
    month: "May",
    badge: "Rest",
  },
];

const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// Dates that have events (for dot indicators)
const EVENT_DATES = new Set(
  EVENTS.filter((e) => e.type !== "rest").map(
    (e) => `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`
  )
);

const SPECIAL_DATES = new Set(
  EVENTS.filter((e) => e.type === "special").map(
    (e) => `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`
  )
);

function MonthCalendar({
  year,
  month,
  today,
}: {
  year: number;
  month: number;
  today: { year: number; month: number; day: number };
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month - 1);

  const cells: { day: number; inMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, inMonth: false });
    }
  }

  const weeks: { day: number; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 text-center">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="py-2 text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 text-center">
          {week.map((cell, ci) => {
            const isToday =
              cell.inMonth &&
              cell.day === today.day &&
              month === today.month &&
              year === today.year;
            const dateKey = `${year}-${month}-${cell.day}`;
            const hasEvent = cell.inMonth && EVENT_DATES.has(dateKey);
            const isSpecial = cell.inMonth && SPECIAL_DATES.has(dateKey);

            return (
              <div key={ci} className="relative flex flex-col items-center py-1">
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? "bg-primary text-primary-foreground font-semibold"
                      : cell.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                  }`}
                >
                  {cell.day}
                </span>
                {hasEvent && !isToday && (
                  <span
                    className={`absolute bottom-0 size-1 rounded-full ${
                      isSpecial ? "bg-destructive" : "bg-foreground/40"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatEventDate(event: (typeof EVENTS)[number]) {
  return event.date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

export default function SchedulePage() {
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(3); // April 2025

  const today = { year: 2025, month: 3, day: 13 };

  const monthName = new Date(year, month).toLocaleString("default", {
    month: "long",
  });

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="px-5 pt-12 pb-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Cell Journey
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Schedule</h1>
      </div>

      {/* Calendar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={prevMonth}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-base font-semibold">
            {monthName} {year}
          </h2>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={nextMonth}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <MonthCalendar year={year} month={month} today={today} />

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-foreground/40" />
            Cell meeting
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-destructive" />
            Special event
          </div>
        </div>
      </div>

      {/* Upcoming */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Upcoming
        </p>

        {EVENTS.map((event, i) => {
          if (event.type === "rest") {
            return (
              <Card key={i} className="shadow-none border">
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {formatEventDate(event)}
                    </p>
                    <p className="text-sm font-medium">{event.title}</p>
                  </div>
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {event.badge}
                  </Badge>
                </CardContent>
              </Card>
            );
          }

          const isNext = event.badge === "Next";

          return (
            <Card
              key={i}
              className={
                isNext
                  ? "bg-primary text-primary-foreground border-0 shadow-none"
                  : "shadow-none border"
              }
            >
              <CardContent className="flex gap-4">
                {/* Date block */}
                <div className="flex flex-col items-center justify-center min-w-[3rem]">
                  <span
                    className={`text-2xl font-bold leading-none ${
                      !isNext && event.type === "special"
                        ? "text-destructive"
                        : isNext
                          ? "text-primary-foreground"
                          : "text-foreground"
                    }`}
                  >
                    {event.date.getDate()}
                  </span>
                  <span
                    className={`text-xs mt-0.5 ${
                      isNext
                        ? "text-primary-foreground/60"
                        : "text-muted-foreground"
                    }`}
                  >
                    {"month" in event && event.month
                      ? `${event.month} · ${event.dayOfWeek}`
                      : event.dayOfWeek}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-xs font-semibold uppercase tracking-widest ${
                        isNext
                          ? "text-primary-foreground/60"
                          : event.type === "special"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {event.type === "cell" ? "Cell meeting" : "Special event"}
                    </p>
                    <Badge
                      variant={
                        isNext
                          ? "secondary"
                          : event.type === "special"
                            ? "destructive"
                            : "outline"
                      }
                      className="rounded-full text-xs shrink-0"
                    >
                      {event.badge}
                    </Badge>
                  </div>
                  <p
                    className={`text-base font-semibold ${
                      isNext ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {event.title}
                  </p>
                  <div
                    className={`flex flex-col gap-0.5 text-xs ${
                      isNext
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {"time" in event && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3" />
                        {event.time}
                      </span>
                    )}
                    {"venue" in event && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3" />
                        {event.venue}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
