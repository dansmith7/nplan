import { useState } from "react";
import styles from "./planner-welcome.module.css";

let welcomePlayed = false;

export function PlannerWelcome() {
  const [visible, setVisible] = useState(() => !welcomePlayed);

  if (!visible) return null;

  return (
    <div
      className={styles.screen}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        welcomePlayed = true;
        setVisible(false);
      }}
    >
      <div className={styles.content}>
        <span className={styles.mark}>n</span>
        <span className={styles.greeting}>Добро пожаловать в NPlan</span>
      </div>
    </div>
  );
}
