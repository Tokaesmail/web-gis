"use client";

import React, { useState, useEffect } from "react";
import { Joyride, Step, EventData, STATUS, ACTIONS, EVENTS } from "react-joyride";
import { useLang } from "./translations";
import { usePathname, useRouter } from "next/navigation";

const TOUR_FINISHED_KEY = "geosense_tour_finished_v1";
const TOUR_STEP_KEY     = "geosense_tour_step_v1";

export default function OnboardingTour() {
  const { t, isRTL } = useLang();
  const pathname = usePathname();
  const router   = useRouter();

  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isFinished = localStorage.getItem(TOUR_FINISHED_KEY);
    if (!isFinished) {
      const savedStep = localStorage.getItem(TOUR_STEP_KEY);
      const initialStep = savedStep ? parseInt(savedStep, 10) : 0;

      setStepIndex(initialStep);
      setRun(true);
    }
  }, []);

  // Sync stepIndex to localStorage so it persists across page navigation
  useEffect(() => {
    if (run) {
      localStorage.setItem(TOUR_STEP_KEY, stepIndex.toString());
    }
  }, [stepIndex, run]);

  if (!mounted) return null;

  const steps: Step[] = [
    {
      target: "#tour-start",
      content: t.tourStart,
      skipBeacon: true,
      placement: "bottom",
    },
    {
      target: "#tour-tools",
      content: t.tourTools,
      placement: isRTL ? "left" : "right",
    },
    {
      target: "#tour-upload",
      content: t.tourUpload,
      placement: isRTL ? "right" : "left",
    },
    {
      target: "#tour-3d",
      content: t.tour3D,
      placement: "bottom",
    },
  ];

  const handleJoyrideCallback = (data: EventData) => {
    const { status, type, action, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      localStorage.setItem(TOUR_FINISHED_KEY, "true");
      localStorage.removeItem(TOUR_STEP_KEY);
    } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextStep = index + (action === ACTIONS.PREV ? -1 : 1);

      // Special case: If we're on step 0 (Hero page button) and moving forward,
      // the click happens on #tour-start which navigates to /map.
      // We don't need to manually navigate here if the user clicks the button itself,
      // but Joyride's "Next" button should also trigger the transition if needed.
      // However, usually we want the user to click the actual UI button.

      setStepIndex(nextStep);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      onEvent={handleJoyrideCallback}
      locale={{
        back: t.tourBack,
        close: t.close,
        last: t.tourDone,
        next: t.tourNext,
        skip: t.tourSkip,
      }}
      styles={{
        overlay: {
          backgroundColor: "rgba(4, 13, 26, 0.85)",
        },
        tooltipContainer: {
          textAlign: isRTL ? "right" : "left",
          fontFamily: isRTL ? "Noto Sans Arabic, sans-serif" : "DM Sans, sans-serif",
        },
        tooltip: {
          borderRadius: "16px",
          border: "1px solid rgba(0, 212, 255, 0.25)",
          backgroundColor: "#0a1628",
          color: "#e2e8f0",
          padding: "10px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        },
        buttonPrimary: {
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: "600",
          padding: "8px 16px",
          color: "#040d1a",
          backgroundColor: "#22d3ee",
        },
        buttonBack: {
          fontSize: "13px",
          fontWeight: "600",
          marginRight: isRTL ? "0" : "10px",
          marginLeft: isRTL ? "10px" : "0",
          color: "#94a3b8",
        },
        buttonSkip: {
          fontSize: "13px",
          color: "#64748b",
        },
      }}
    />
  );
}
