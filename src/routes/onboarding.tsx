          {screen === "intro" ? (
            <motion.section
              key="lens-intro"
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              {...(reducedMotion ? {} : { exit: { opacity: 0, y: -10 } })}
              className="relative w-full max-w-xl"
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/90 shadow-[0_0_0_1px_rgba(126,180,76,0.08)]">
                <Sparkles className="size-3.5" />
                Quick gut check
              </div>

              <h1 className="max-w-xl font-display text-[clamp(2.8rem,7vw,5rem)] font-semibold leading-[0.9] tracking-[-0.06em] text-foreground">
                Before you start
                <span className="ml-1 text-primary">…</span>
              </h1>

              <div className="mt-6 space-y-2">
                <p className="text-xl font-medium text-foreground sm:text-2xl">
                  5 situations. Trust your gut.
                </p>
                <p className="max-w-md text-base leading-7 text-muted-foreground">
                  No right answers. Just your instincts.
                </p>
              </div>

              <Button
                onClick={onStart}
                className="mt-8 h-14 w-full rounded-full bg-[#A9D86C] text-base font-semibold text-[#1b1b1b] shadow-[0_18px_32px_rgba(142,190,92,0.28)] transition-transform hover:translate-y-[-1px] hover:bg-[#b7e07d]"
              >
                Let’s go
                <ArrowRight className="size-4" />
              </Button>

              <button
                type="button"
                onClick={onSkip}
                className="mt-4 block w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                Skip for now
              </button>
            </motion.section>
          ) : screen === "scenario" && scenario ? (