import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';

/**
 * The opening sequence: two statements, revealed by scrolling.
 *
 * ## Why this is no longer a video
 *
 * It used to scrub an 8.7 MB clip's `currentTime` from a GSAP ScrollTrigger.
 * That stuttered badly, and the cause was in the file rather than the code:
 * walking the MP4 container shows **no `stss` atom** — no sync-sample table —
 * while `stco` is present. Without a keyframe index the browser cannot seek
 * cheaply, so every scroll tick paid for a decode from the last recoverable
 * point. No amount of tuning `scrub` fixes a file the decoder cannot index,
 * and re-encoding was not available here.
 *
 * So the sequence is built from the poster still and type instead. Everything
 * animated is `transform` and `opacity`, which the compositor handles without
 * touching layout or paint — the result is smooth by construction rather than
 * by tuning, and it drops 8.7 MB from a page whose own argument is about
 * rural bandwidth.
 *
 * ## How it works
 *
 * One `position: sticky` stage inside a tall scroll track. A single
 * `scroll` listener writes a 0–1 progress value into CSS custom properties,
 * and CSS does the rest. No animation library, no rAF loop of its own —
 * `scroll` already fires on the compositor's schedule, and the handler does
 * nothing but a few arithmetic operations and two `setProperty` calls.
 */

const EYEBROW = 'flex items-center justify-center gap-2 font-display text-xs uppercase tracking-[0.3em]';

/** How far through the track each beat holds the screen. */
const BEATS = [
  { at: 0.0, until: 0.46 },
  { at: 0.54, until: 1.0 },
] as const;

export function HeroMedia() {
  return prefersReducedMotion() ? <StaticHero /> : <ScrollHero />;
}

/**
 * Both statements, stacked and still.
 *
 * Not the scrolling version with its animation disabled: that would leave a
 * 250vh track of empty space to scroll past. Someone who has asked for less
 * motion should get a shorter page, not the same page held still.
 */
function StaticHero() {
  return (
    <section className="relative -mx-5 overflow-hidden sm:-mx-8">
      <div className="relative min-h-[70vh] w-full">
        <img
          src="/hero-farmer-poster.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-shade-900 via-shade-900/80 to-shade-900/50" />

        <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-12 px-5 py-20 text-center sm:px-8">
          <div>
            <p className={`${EYEBROW} text-kenya-red-400`}>
              <span className="h-px w-6 bg-kenya-red-400" aria-hidden />
              The problem
              <span className="h-px w-6 bg-kenya-red-400" aria-hidden />
            </p>
            <p className="mt-4 font-display text-3xl leading-tight text-bleach sm:text-5xl">
              Farmers decide by looking at the sky. A forecast built for a continent is wrong for
              one field.
            </p>
          </div>
          <div>
            <p className={`${EYEBROW} text-kenya-green-400`}>
              <span className="h-px w-6 bg-kenya-green-400" aria-hidden />
              The answer
              <span className="h-px w-6 bg-kenya-green-400" aria-hidden />
            </p>
            <p className="mt-4 font-display text-2xl leading-tight text-bleach sm:text-4xl">
              KIVULI corrects that forecast against a ground station in Juja, and turns it into one
              instruction: spray now, or wait.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScrollHero() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!track || !stage) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) return;

      // 0 when the track's top reaches the viewport top, 1 when its bottom does.
      const p = Math.min(Math.max(-rect.top / scrollable, 0), 1);
      stage.style.setProperty('--p', p.toFixed(4));

      // Each beat fades in, holds, and fades out across its own window, so
      // the two statements cross over rather than cutting.
      BEATS.forEach((b, i) => {
        const span = b.until - b.at;
        const local = Math.min(Math.max((p - b.at) / span, 0), 1);
        // A trapezoid: up over the first fifth, hold, down over the last.
        const o = Math.min(local / 0.2, 1, Math.max((1 - local) / 0.2, 0));
        stage.style.setProperty(`--o${i}`, o.toFixed(3));
        stage.style.setProperty(`--y${i}`, `${(1 - o) * 24}px`);
      });
    };

    // `scroll` already fires on the compositor's schedule; the rAF guard just
    // collapses bursts so the handler runs at most once a frame.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    setReady(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div ref={trackRef} className="relative -mx-5 h-[260vh] sm:-mx-8">
      <div
        ref={stageRef}
        className="sticky top-0 h-screen overflow-hidden"
        style={
          {
            '--p': 0,
            '--o0': 1,
            '--o1': 0,
            '--y0': '0px',
            '--y1': '24px',
          } as React.CSSProperties
        }
      >
        {/* The still, drifting and scaling with progress. Transform only, so
            this never triggers layout or paint. */}
        <img
          src="/hero-farmer-poster.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover will-change-transform"
          style={{
            transform:
              'scale(calc(1.12 - var(--p) * 0.12)) translate3d(0, calc(var(--p) * -4vh), 0)',
          }}
        />

        {/* Two scrims: one to seat the type, one that deepens as the sequence
            resolves, so the second statement lands on a darker, calmer ground
            than the first. */}
        <div className="absolute inset-0 bg-gradient-to-t from-shade-900 via-shade-900/70 to-shade-900/40" />
        <div
          className="absolute inset-0 bg-shade-900"
          style={{ opacity: 'calc(var(--p) * 0.45)' }}
        />

        <div className="relative mx-auto flex h-full max-w-3xl items-center px-5 sm:px-8">
          <div className="w-full text-center">
            <div
              className="col-start-1 row-start-1 will-change-transform"
              style={{
                gridArea: '1 / 1',
                opacity: 'var(--o0)',
                transform: 'translate3d(0, var(--y0), 0)',
              }}
            >
              <p className={`${EYEBROW} text-kenya-red-400`}>
                <span className="h-px w-6 bg-kenya-red-400" aria-hidden />
                The problem
                <span className="h-px w-6 bg-kenya-red-400" aria-hidden />
              </p>
              <p className="mt-4 font-display text-4xl leading-tight text-bleach sm:text-6xl">
                Farmers decide by looking at the sky. A forecast built for a continent is wrong for
                one field.
              </p>
            </div>

            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-5 will-change-transform sm:px-8"
              style={{
                opacity: 'var(--o1)',
                transform: 'translate3d(0, calc(-50% + var(--y1)), 0)',
              }}
            >
              <p className={`${EYEBROW} text-kenya-green-400`}>
                <span className="h-px w-6 bg-kenya-green-400" aria-hidden />
                The answer
                <span className="h-px w-6 bg-kenya-green-400" aria-hidden />
              </p>
              <p className="mt-4 font-display text-3xl leading-tight text-bleach sm:text-5xl">
                KIVULI corrects that forecast against a ground station in Juja, and turns it into
                one instruction: spray now, or wait.
              </p>
            </div>
          </div>
        </div>

        {/* Only while the first beat holds, and only once the listener is
            attached — a hint to scroll that appears before anything responds
            to scrolling would be worse than none. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center"
          style={{ opacity: ready ? 'calc(var(--o0) * 0.7)' : 0 }}
        >
          <span className="animate-float-slow font-display text-xs uppercase tracking-[0.3em] text-shade-200">
            Scroll
          </span>
        </div>
      </div>
    </div>
  );
}
