"use client";

import { useEffect, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useActor } from "@/lib/actor-context";
import { NAV_ITEMS } from "./Sidebar";

// Fires from ActorBar's "Replay tour" link — a plain DOM event rather than
// context/prop-drilling, since ActorBar and this component are unrelated
// siblings under AppShell with no natural shared state to carry a callback.
export const REPLAY_TOUR_EVENT = "replay-onboarding-tour";

export function OnboardingTour() {
  const { user } = useActor();
  const startedRef = useRef(false);

  function startTour() {
    if (!user) return;
    const steps = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => ({
      element: `[data-tour="${item.href}"]`,
      popover: { title: item.label, description: item.description },
    }));
    if (steps.length === 0) return;

    const tourDriver = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      steps,
      onDestroyed: () => {
        fetch("/api/me/tour", { method: "POST" }).catch(() => {});
      },
    });
    tourDriver.drive();
  }

  // Auto-show once on first login — checked against the DB (not the session
  // cookie, which is only as fresh as the last login) so completing the tour
  // in one session reliably prevents it from reappearing in the next.
  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;
    fetch("/api/me/tour")
      .then((r) => r.json())
      .then((data) => {
        if (!data.completed) startTour();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    function handleReplay() {
      startTour();
    }
    window.addEventListener(REPLAY_TOUR_EVENT, handleReplay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, handleReplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}
