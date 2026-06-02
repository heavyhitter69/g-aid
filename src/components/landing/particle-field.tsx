"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
}

const GRID_SPACING = 38;
const MOUSE_RADIUS = 140;
const ATTRACTION_STRENGTH = 0.18;
const RETURN_STRENGTH = 0.06;
const DAMPING = 0.82;
const MAX_DISPLACEMENT = 60;

export function ParticleField() {
  const theme = useAppStore((state) => state.theme);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  const particles = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastMoveTime = Date.now();
    let currentStrength = 0;

    // Build the particle grid
    function buildGrid() {
      if (!canvas) return;
      particles.current = [];
      const cols = Math.ceil(canvas.width / GRID_SPACING) + 1;
      const rows = Math.ceil(canvas.height / GRID_SPACING) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * GRID_SPACING;
          const y = row * GRID_SPACING;
          // Vary size and opacity slightly for depth
          const size = 1 + Math.random() * 1.2;
          const baseAlpha = 0.12 + Math.random() * 0.18;
          particles.current.push({
            x,
            y,
            originX: x,
            originY: y,
            vx: 0,
            vy: 0,
            size,
            alpha: baseAlpha,
            baseAlpha,
          });
        }
      }
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      buildGrid();
    }

    function onMouseMove(e: MouseEvent) {
      mouse.current = { x: e.clientX, y: e.clientY };
      lastMoveTime = Date.now();
    }

    function onMouseLeave() {
      mouse.current = { x: -9999, y: -9999 };
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouse.current.x;
      const my = mouse.current.y;

      const now = Date.now();
      const timeSinceLastMove = now - lastMoveTime;

      // targetStrength is 1 if mouse is active (moved in last 150ms), 0 otherwise
      const targetStrength = timeSinceLastMove < 150 ? 1 : 0;

      // Smoothly interpolate currentStrength toward targetStrength
      if (targetStrength === 1) {
        currentStrength += (1 - currentStrength) * 0.15; // fast response to motion
      } else {
        currentStrength += (0 - currentStrength) * 0.05; // smooth return to base state when stopped
      }

      for (const p of particles.current) {
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_RADIUS && dist > 0 && currentStrength > 0.01) {
          // Attract toward mouse, scaled by currentStrength
          const baseForce = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          const force = baseForce * currentStrength;
          p.vx += (dx / dist) * force * ATTRACTION_STRENGTH * MAX_DISPLACEMENT;
          p.vy += (dy / dist) * force * ATTRACTION_STRENGTH * MAX_DISPLACEMENT;

          // Brighten particles close to mouse, scaled by currentStrength
          p.alpha = Math.min(0.85, p.baseAlpha + force * 0.7);
        } else {
          // Dim back to base
          p.alpha += (p.baseAlpha - p.alpha) * 0.08;
        }

        // Spring return to origin
        p.vx += (p.originX - p.x) * RETURN_STRENGTH;
        p.vy += (p.originY - p.y) * RETURN_STRENGTH;

        // Dampen velocity
        p.vx *= DAMPING;
        p.vy *= DAMPING;

        // Apply velocity
        p.x += p.vx;
        p.y += p.vy;

        // Draw the dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        if (themeRef.current === "light") {
          ctx.fillStyle = `rgba(29, 78, 216, ${p.alpha * 1.8})`; // royal blue with higher opacity for light theme visibility
        } else {
          ctx.fillStyle = `rgba(147, 197, 253, ${p.alpha})`; // blue-300 tint for dark theme
        }
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", resize);

    resize();
    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
