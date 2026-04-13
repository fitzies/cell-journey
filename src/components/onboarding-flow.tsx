"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SERVICE_OPTIONS = [
  { value: "saturday-5pm", label: "Saturday 5:00 PM" },
  { value: "sunday-9am", label: "Sunday 9:00 AM" },
  { value: "sunday-11am", label: "Sunday 11:00 AM" },
  { value: "sunday-2pm", label: "Sunday 2:00 PM" },
];

export function OnboardingFlow({ userName }: { userName: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(userName);
  const [service, setService] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  async function handleFinish() {
    if (!name.trim() || !service) return;

    setIsSubmitting(true);
    try {
      await completeOnboarding({
        name: name.trim(),
        serviceAttending: service,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`h-1 w-8 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === 0 ? (
          <NameStep
            name={name}
            onNameChange={setName}
            onNext={() => setStep(1)}
          />
        ) : (
          <ServiceStep
            service={service}
            onServiceChange={setService}
            onBack={() => setStep(0)}
            onFinish={handleFinish}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </div>
  );
}

function NameStep({
  name,
  onNameChange,
  onNext,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/icon.svg" alt="Cell Journey" className="w-10 h-10" />
        <h1 className="text-2xl font-semibold tracking-tight">
          What's your name?
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirm or update the name your group will see.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onNext();
        }}
        className="w-full flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your name"
            className="h-11"
            autoFocus
          />
        </div>

        <Button type="submit" className="h-11" disabled={!name.trim()}>
          Continue
        </Button>
      </form>
    </>
  );
}

function ServiceStep({
  service,
  onServiceChange,
  onBack,
  onFinish,
  isSubmitting,
}: {
  service: string;
  onServiceChange: (service: string) => void;
  onBack: () => void;
  onFinish: () => void;
  isSubmitting: boolean;
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/icon.svg" alt="Cell Journey" className="w-10 h-10" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Which service do you attend?
        </h1>
        <p className="text-sm text-muted-foreground">
          This helps your leader know your schedule.
        </p>
      </div>

      <div className="w-full flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="service">Service</Label>
          <Select value={service} onValueChange={onServiceChange}>
            <SelectTrigger id="service" className="h-11 w-full">
              <SelectValue placeholder="Select a service" />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            className="h-11"
            disabled={!service || isSubmitting}
            onClick={onFinish}
          >
            {isSubmitting ? "Saving..." : "Get Started"}
          </Button>
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </>
  );
}
