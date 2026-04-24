"use client";

import React, { useState, useEffect } from "react";
import { Joyride, Step, EventData, STATUS, ACTIONS, EVENTS } from "react-joyride";
import { useLang } from "./translations";
import { usePathname } from "next/navigation";

const TOUR_STORAGE_KEY = "geosense_tour_finished";

export default function OnboardingTour() {
  const { t, isRTL } = useLang();
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isFinished = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!isFinished) {
      setRun(true);
      if (pathname === "/map") {
        setStepIndex(1);
      } else {
        setStepIndex(0);
      }
    }
  }, [pathname]);

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
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
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
