import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';

gsap.registerPlugin(ScrollTrigger);

const PROBLEM_COPY = (
  <>
    <p className="flex items-center justify-center gap-2 font-display text-xs uppercase tracking-[0.3em] text-kenya-red-400">
      <span className="h-px w-6 bg-kenya-red-400" aria-hidden />
      The problem
      <span className="h-px w-6 bg-kenya-red-400" aria-hidden />
    </p>
    <p className="mt-4 font-display text-4xl leading-tight text-bleach sm:text-6xl">
      Farmers decide by looking at the sky. A forecast built for a continent is wrong for one
      field.
    </p>
  </>
);

const ANSWER_COPY = (
  <>
    <p className="flex items-center justify-center gap-2 font-display text-xs uppercase tracking-[0.3em] text-kenya-green-400">
      <span className="h-px w-6 bg-kenya-green-400" aria-hidden />
      The answer
      <span className="h-px w-6 bg-kenya-green-400" aria-hidden />
    </p>
    <p className="mt-4 font-display text-3xl leading-tight text-bleach sm:text-5xl">
      KIVULI corrects that forecast against a ground station in Juja, and turns it into one
      instruction: spray now, or wait.
    </p>
  </>
);

/**
 * Entry point: picks the scroll-scrubbed hero or a static fallback.
 *
 * The scrubbed version's whole point is "controlled by scroll" — precisely
 * the kind of motion some users turn `prefers-reduced-motion` on to avoid,
 * not just a flourish layered over otherwise-static content. Rather than
 * threading a `reducedMotion` conditional through every className of one
 * shared layout (which was tried and produced a fragile mess of `h-full` vs
 * `min-h-screen` height fights), the two are simply separate components.
 */
export function HeroMedia() {
  return prefersReducedMotion() ? <StaticHero /> : <ScrubbedHero />;
}

/** No animation, no pinning: a normal full-bleed section, sized to its content. */
function StaticHero() {
  return (
    // `left-1/2 -translate-x-1/2` is load-bearing, not decoration. This sits
    // inside `<main class="mx-auto max-w-5xl">`, so a bare `w-screen` starts
    // at the column's left edge and runs a viewport's width to the right of
    // it — the section renders visibly offset, with a gap down the left.
    // ScrubbedHero never hit this because its stage is `position: fixed`,
    // which resolves against the viewport instead of the column.
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-hidden bg-shade-900">
      {/* A frame from the hero clip, not `hero-community.jpg` — that photo is
          already the site header directly above this section, and using it
          here too rendered the same picture twice in a row. */}
      <img
        src="/hero-farmer-poster.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-shade-900 via-shade-900/60 to-shade-900/20" />
      <div className="absolute inset-0 bg-shade-900/20" />

      <div className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-5 py-16 text-center sm:px-8">
        <div className="max-w-2xl">{PROBLEM_COPY}</div>
        <div className="max-w-2xl">{ANSWER_COPY}</div>
      </div>
    </div>
  );
}

/**
 * Fullscreen, scroll-scrubbed video hero for the Overview page.
 *
 * The video does not autoplay: it only advances while the user scrolls this
 * section, and holds its frame when they stop — the section is "played" by
 * scrolling, not watched passively. "The problem" and "the answer" surface
 * as distinct beats along that same scroll range rather than fading in once
 * on arrival.
 *
 * Pinning is done by hand rather than via ScrollTrigger's `pin: true`.
 * `pin: true` inlines `position: fixed` plus the trigger's *current*
 * `left`/`width` directly onto that element so it visually "stays put" —
 * but this component lives inside `<main class="mx-auto max-w-5xl ...">`,
 * so the trigger's current width is ~960px, not the viewport, and GSAP
 * bakes that width in as an inline style once fixed. Since `<main>` is a
 * shared layout container (other pages need their normal reading width), the
 * fix is here, not there: a plain marker div reserves the scroll height in
 * document flow, and a `position: fixed` sibling — toggled by
 * `onEnter`/`onLeaveBack` and rendered as a *portal-free* fixed overlay via
 * plain CSS, not GSAP's pin — supplies the actual viewport-wide visuals.
 */
function ScrubbedHero() {
  const markerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinnedAtBottom, setPinnedAtBottom] = useState(false);

  // `preload="none"` means the browser fetches nothing on its own, so
  // `loadedmetadata` would never fire and `videoReady` would never flip -
  // leaving the scrub timeline uninitialised and the hero frozen on its
  // poster. Kick off the load only once the section is near the viewport:
  // someone who never scrolls past the fold still pays nothing, and someone
  // who scrolls has the metadata by the time the pin engages.
  useEffect(() => {
    const marker = markerRef.current;
    const video = videoRef.current;
    if (!marker || !video) return;

    // No IntersectionObserver (or a very old browser): just load, rather than
    // risk a hero that never animates.
    if (typeof IntersectionObserver === 'undefined') {
      video.load();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          video.load();
          io.disconnect();
        }
      },
      // Start fetching a screen early so the metadata lands before the pin.
      { rootMargin: '100% 0px' },
    );
    io.observe(marker);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    const video = videoRef.current;
    const problem = problemRef.current;
    const answer = answerRef.current;
    const hint = scrollHintRef.current;
    if (!marker || !video || !problem || !answer || !hint || !videoReady) return;

    const ctx = gsap.context(() => {
      // Every tween below gets an explicit duration so the timeline's total
      // length is exactly 1 — on a scrubbed timeline, "duration" consumes a
      // fraction of the whole scroll range, so leaving it at GSAP's default
      // (0.5s) would make the timeline's real length whatever the longest
      // unlabelled tween happens to add up to, and every position label
      // below would stop corresponding to the scroll fraction it was
      // written for.
      const TOTAL = 1;
      const tl = gsap.timeline({ paused: true });

      const durationProxy = { t: 0 };
      tl.to(
        durationProxy,
        {
          t: video.duration || 1,
          duration: TOTAL,
          ease: 'none',
          onUpdate: () => {
            video.currentTime = durationProxy.t;
          },
        },
        0,
      );

      tl.to(hint, { opacity: 0, duration: 0.08, ease: 'none' }, 0);

      tl.fromTo(
        problem,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.14, ease: 'none' },
        0.05,
      );
      tl.to(problem, { opacity: 0, y: -24, duration: 0.12, ease: 'none' }, 0.4);

      tl.fromTo(
        answer,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.18, ease: 'none' },
        0.52,
      );
      // Beats spread across the whole 0-1 range rather than finishing at
      // 0.55: previously the last 45% of the scroll advanced nothing but
      // video. Ending exactly at 1.0 also means the answer fades out under
      // its own tween instead of being hard-cut the moment the stage unpins.
      tl.to(answer, { opacity: 0, y: -24, duration: 0.12, ease: 'none' }, 0.88);

      ScrollTrigger.create({
        trigger: marker,
        start: 'top top',
        // Half the previous range. The clip is only ~8s, so stretching it
        // over 300% of viewport height left long stretches where a big scroll
        // barely moved the picture.
        //
        // `scrub: 1.2` (was 0.5) is the bigger win: a mouse wheel arrives as
        // ~100px jumps, and the longer catch-up lag turns those discrete
        // targets into a stream of small forward deltas, which is the seek
        // pattern browsers handle best.
        end: '+=150%',
        scrub: 1.2,
        onUpdate: (self) => tl.progress(self.progress),
        onToggle: (self) => setPinned(self.isActive),
        onEnter: () => setPinnedAtBottom(false),
        onLeave: () => setPinnedAtBottom(true),
        onEnterBack: () => setPinnedAtBottom(false),
        onLeaveBack: () => setPinnedAtBottom(false),
      });
    }, marker);

    return () => ctx.revert();
  }, [videoReady]);

  return (
    // Reserves the scroll height in normal document flow — this element has
    // no visuals of its own, only the height the scrubbed section needs.
    // Kept deliberately taller than the trigger's `end` (200vh vs 150vh): the
    // surplus is what `pinnedAtBottom` parks against, and with no surplus the
    // fixed-to-absolute swap lands on a single pixel and jumps a frame.
    <div ref={markerRef} className="relative h-[200vh]">
      <div
        className={`h-screen w-screen overflow-hidden bg-shade-900 ${
          pinned
            ? 'fixed inset-0'
            : pinnedAtBottom
              ? 'absolute bottom-0 left-1/2 -translate-x-1/2'
              : 'absolute left-1/2 top-0 -translate-x-1/2'
        }`}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          // `none`, not `auto`: the clip is 9.1 MB and most visitors never
          // scroll far enough to scrub it. Eager preloading spent a rural
          // user's data on a decoration they never saw. The poster below is
          // 136 KB and carries the first frame until the scrub actually
          // starts, at which point the browser fetches on demand.
          preload="none"
          poster="/hero-farmer-poster.jpg"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          onLoadedMetadata={() => setVideoReady(true)}
        >
          <source src="/hero-farmer.mp4" type="video/mp4" />
        </video>

        {/* Ground the footage in the app's palette rather than showing raw
            footage colors, and guarantee text contrast regardless of the
            frame currently playing underneath. */}
        <div className="absolute inset-0 bg-gradient-to-t from-shade-900 via-shade-900/60 to-shade-900/20" />
        <div className="absolute inset-0 bg-shade-900/20" />

        <div className="relative flex h-full flex-col items-center justify-center px-5 text-center sm:px-8">
          <div ref={problemRef} className="absolute max-w-2xl opacity-0">
            {PROBLEM_COPY}
          </div>
          <div ref={answerRef} className="absolute max-w-2xl opacity-0">
            {ANSWER_COPY}
          </div>
        </div>

        {/* Scroll affordance — this section only moves while the user scrolls,
            so it is the one hint that matters here. */}
        <div
          ref={scrollHintRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-shade-200"
          aria-hidden="true"
        >
          <div className="animate-float-slow flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.2em]">Scroll to play</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v16m0 0l-6-6m6 6l6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
