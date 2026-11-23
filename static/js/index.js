const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const setupTableOfContents = () => {
    const tocLinks = [...document.querySelectorAll(".toc-link")];
    const sections = tocLinks
        .map((link) => document.querySelector(link.getAttribute("href")))
        .filter(Boolean);

    if (!sections.length) {
        return;
    }

    const setActiveSection = (id) => {
        tocLinks.forEach((link) => {
            const isActive = link.getAttribute("href") === `#${id}`;
            link.classList.toggle("is-active", isActive);
            if (isActive) {
                link.setAttribute("aria-current", "location");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    };

    const observer = new IntersectionObserver(
        (entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

            if (visible) {
                setActiveSection(visible.target.id);
            }
        },
        {
            rootMargin: "-28% 0px -58% 0px",
            threshold: [0.05, 0.2, 0.45],
        }
    );

    sections.forEach((section) => observer.observe(section));
};

const shiftFilmStages = [
    {
        duration: 11500,
        title: "The camera rarely matches the robot's view.",
        copy: "The same demonstration is re-recorded from a top view, a close or distant third-person view, and a moving handheld camera.",
    },
    {
        duration: 11500,
        title: "Everyday tables hold more than the target.",
        copy: "Clutter appears in the demonstration, or other objects and look-alike instances are added to the robot's scene.",
    },
    {
        duration: 20500,
        title: "Same skill, faster or slower.",
        copy: "The video stays fixed; the instruction asks for 2x or 0.5x execution speed and states the target duration.",
    },
    {
        duration: 19000,
        title: "Reuse the clip, add a requirement.",
        copy: "The video stays fixed; the instruction adds a requirement: repeat the task, do not touch other objects, or use a given arm.",
    },
    {
        duration: 15000,
        title: "When video and text disagree.",
        copy: "The video and the text describe different tasks, and the instruction says which modality to follow.",
    },
];

const formatClock = (milliseconds) => {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const setupIclFilm = () => {
    const film = document.querySelector("[data-icl-film]");
    if (!film) {
        return;
    }

    const panels = [...film.querySelectorAll("[data-film-panel]")];
    const chapterButtons = [...film.querySelectorAll("[data-film-stage]")];
    const title = film.querySelector("[data-film-title]");
    const copy = film.querySelector("[data-film-copy]");
    const toggle = film.querySelector("[data-film-toggle]");
    const toggleIcon = toggle.querySelector("i");
    const replay = film.querySelector("[data-film-replay]");
    const timeline = film.querySelector("[data-film-timeline]");
    const timelineFill = film.querySelector("[data-film-timeline-fill]");
    const time = film.querySelector("[data-film-time]");

    const starts = [];
    let total = 0;
    shiftFilmStages.forEach((stage) => {
        starts.push(total);
        total += stage.duration;
    });
    timeline.setAttribute("aria-valuemax", String(total / 1000));

    let elapsed = 0;
    let activeStage = -1;
    let animationFrame = null;
    let previousTimestamp = null;
    let isPlaying = false;
    let isVisible = false;
    let hasStarted = false;

    const panelVideos = panels.map((panel) => [...panel.querySelectorAll("video")]);
    panelVideos.flat().forEach((video) => {
        const rate = Number(video.dataset.playbackRate) || 1;
        const applyRate = () => {
            video.defaultPlaybackRate = rate;
            video.playbackRate = rate;
        };
        applyRate();
        video.addEventListener("loadedmetadata", applyRate);
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            video.classList.add("is-ready");
        } else {
            video.addEventListener("loadeddata", () => video.classList.add("is-ready"), { once: true });
        }
    });

    const stageFromElapsed = () => {
        for (let index = starts.length - 1; index >= 0; index -= 1) {
            if (elapsed >= starts[index]) {
                return index;
            }
        }
        return 0;
    };

    const syncVideoPlayback = () => {
        panelVideos.forEach((videos, index) => {
            const shouldPlay = isVisible && index === activeStage && (isPlaying || elapsed >= total || prefersReducedMotion);
            videos.forEach((video) => {
                if (shouldPlay) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        });
    };

    const updateToggle = () => {
        const atEnd = elapsed >= total;
        toggleIcon.className = `fas ${isPlaying ? "fa-pause" : atEnd ? "fa-redo-alt" : "fa-play"}`;
        toggle.setAttribute("aria-label", isPlaying ? "Pause story" : atEnd ? "Replay story" : "Play story");
    };

    const updateProgress = () => {
        const clamped = Math.min(total, Math.max(0, elapsed));
        timelineFill.style.width = `${(clamped / total) * 100}%`;
        timeline.setAttribute("aria-valuenow", (clamped / 1000).toFixed(1));
        time.textContent = `${formatClock(clamped)} / ${formatClock(total)}`;
    };

    const setStage = (index) => {
        if (index === activeStage) {
            return;
        }
        activeStage = index;
        const stage = shiftFilmStages[index];
        film.dataset.stage = String(index);
        panels.forEach((panel, panelIndex) => {
            const isActive = panelIndex === index;
            panel.classList.toggle("is-active", isActive);
            panel.setAttribute("aria-hidden", String(!isActive));
        });
        panelVideos[index].forEach((video) => {
            video.preload = "auto";
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                video.currentTime = 0;
            } else {
                video.addEventListener("loadedmetadata", () => {
                    video.currentTime = 0;
                }, { once: true });
            }
        });
        const next = panelVideos[index + 1];
        if (next) {
            next.forEach((video) => {
                video.preload = "auto";
            });
        }
        chapterButtons.forEach((button, buttonIndex) => {
            const isActive = buttonIndex === index;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", String(isActive));
        });
        title.textContent = stage.title;
        copy.textContent = stage.copy;
        syncVideoPlayback();
    };

    const stop = () => {
        isPlaying = false;
        previousTimestamp = null;
        if (animationFrame) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        updateToggle();
        syncVideoPlayback();
    };

    const tick = (timestamp) => {
        if (!isPlaying) {
            return;
        }
        if (previousTimestamp !== null) {
            elapsed = Math.min(total, elapsed + (timestamp - previousTimestamp));
        }
        previousTimestamp = timestamp;
        setStage(stageFromElapsed());
        updateProgress();
        if (elapsed >= total) {
            stop();
            return;
        }
        animationFrame = window.requestAnimationFrame(tick);
    };

    const start = (restart = false) => {
        if (prefersReducedMotion || !isVisible || document.hidden) {
            return;
        }
        if (restart || elapsed >= total) {
            elapsed = 0;
            setStage(0);
            updateProgress();
        }
        if (isPlaying) {
            return;
        }
        isPlaying = true;
        previousTimestamp = null;
        updateToggle();
        syncVideoPlayback();
        animationFrame = window.requestAnimationFrame(tick);
    };

    const seekTo = (nextElapsed, shouldResume = isPlaying) => {
        elapsed = Math.min(total, Math.max(0, nextElapsed));
        setStage(stageFromElapsed());
        updateProgress();
        if (shouldResume && elapsed < total) {
            start();
        } else {
            stop();
        }
    };

    chapterButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
            isVisible = true;
            seekTo(starts[index], true);
        });
    });
    toggle.addEventListener("click", () => {
        isVisible = true;
        if (isPlaying) {
            stop();
        } else {
            start(elapsed >= total);
        }
    });
    replay.addEventListener("click", () => {
        isVisible = true;
        start(true);
    });
    timeline.addEventListener("pointerdown", (event) => {
        isVisible = true;
        const rect = timeline.getBoundingClientRect();
        seekTo(((event.clientX - rect.left) / rect.width) * total, isPlaying);
    });
    timeline.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            return;
        }
        event.preventDefault();
        if (event.key === "Home") {
            seekTo(0, false);
        } else if (event.key === "End") {
            seekTo(total, false);
        } else {
            seekTo(elapsed + (event.key === "ArrowRight" ? 1000 : -1000), isPlaying);
        }
    });

    setStage(0);
    updateProgress();
    updateToggle();

    if (prefersReducedMotion) {
        film.classList.add("is-reduced-motion");
    }

    const observer = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible && !hasStarted && !prefersReducedMotion) {
            hasStarted = true;
            start();
        } else if (!isVisible) {
            stop();
        } else {
            syncVideoPlayback();
        }
    }, { threshold: 0.35 });

    observer.observe(film);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stop();
        }
    });
};

const formatVideoTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
};

const bindVideoProgress = (video) => {
    const shell = video.closest(".video-shell");
    const playToggle = shell.querySelector(".video-play-toggle");
    const progress = shell.querySelector(".video-progress");
    const fill = shell.querySelector(".video-progress-fill");
    const currentTime = shell.querySelector(".video-time-current");
    const durationTime = shell.querySelector(".video-time-duration");
    let isDragging = false;
    let pendingSeekRatio = null;

    const progressFromEvent = (event) => {
        const rect = progress.getBoundingClientRect();
        const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
        return rect.width ? x / rect.width : 0;
    };

    const updateProgress = () => {
        const duration = video.duration;
        const ratio = Number.isFinite(duration) && duration > 0 ? video.currentTime / duration : 0;
        const percent = Math.min(Math.max(ratio * 100, 0), 100);
        fill.style.width = `${percent}%`;
        progress.setAttribute("aria-valuenow", String(Math.round(percent)));
        currentTime.textContent = formatVideoTime(video.currentTime);
        durationTime.textContent = formatVideoTime(duration);
    };

    const updatePlaybackState = () => {
        const isPlaying = !video.paused && !video.ended;
        playToggle.classList.toggle("is-playing", isPlaying);
        playToggle.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
    };

    const seekToRatio = (ratio) => {
        const clampedRatio = Math.min(Math.max(ratio, 0), 1);

        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            pendingSeekRatio = clampedRatio;
            return;
        }

        video.currentTime = clampedRatio * video.duration;
        updateProgress();
    };

    progress.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        isDragging = true;
        progress.classList.add("is-dragging");
        progress.setPointerCapture(event.pointerId);
        seekToRatio(progressFromEvent(event));
    });

    progress.addEventListener("pointermove", (event) => {
        if (isDragging) {
            seekToRatio(progressFromEvent(event));
        }
    });

    const finishDrag = (event) => {
        isDragging = false;
        progress.classList.remove("is-dragging");
        if (event && progress.hasPointerCapture(event.pointerId)) {
            progress.releasePointerCapture(event.pointerId);
        }
    };

    progress.addEventListener("pointerup", finishDrag);
    progress.addEventListener("pointercancel", finishDrag);

    progress.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
        }

        event.preventDefault();
        const step = event.key === "ArrowRight" ? 0.05 : -0.05;
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        seekToRatio((video.currentTime / duration) + step);
    });

    playToggle.addEventListener("click", () => {
        if (video.paused || video.ended) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    });

    video.addEventListener("timeupdate", updateProgress);
    video.addEventListener("loadedmetadata", () => {
        if (pendingSeekRatio !== null) {
            const ratio = pendingSeekRatio;
            pendingSeekRatio = null;
            seekToRatio(ratio);
        } else {
            updateProgress();
        }
    });
    video.addEventListener("durationchange", updateProgress);
    video.addEventListener("play", updatePlaybackState);
    video.addEventListener("pause", updatePlaybackState);
    video.addEventListener("ended", updatePlaybackState);
    updatePlaybackState();
};

const setupPromoVideo = () => {
    const video = document.querySelector("[data-promo-video]");
    if (!video) {
        return;
    }

    const audioToggle = document.querySelector("[data-promo-audio-toggle]");
    const audioToggleIcon = audioToggle ? audioToggle.querySelector("i") : null;
    const volumeSlider = document.querySelector("[data-promo-volume]");
    const volumeFill = volumeSlider ? volumeSlider.querySelector(".promo-volume-fill") : null;
    const defaultVolume = 0.85;
    let lastVolume = defaultVolume;
    let isAdjustingVolume = false;
    let isVisible = false;

    const updateAudioState = () => {
        if (!audioToggle) {
            return;
        }

        const isMuted = video.muted || video.volume === 0;
        audioToggle.classList.toggle("is-muted", isMuted);
        audioToggle.classList.toggle("is-unmuted", !isMuted);
        audioToggle.setAttribute("aria-label", isMuted ? "Unmute promotional video" : "Mute promotional video");

        if (audioToggleIcon) {
            const iconName = isMuted ? "fa-volume-mute" : video.volume < 0.5 ? "fa-volume-down" : "fa-volume-up";
            audioToggleIcon.className = `fas ${iconName}`;
        }

        if (volumeSlider) {
            const displayVolume = isMuted ? 0 : video.volume;
            const volumePercent = Math.round(displayVolume * 100);
            volumeSlider.setAttribute("aria-valuenow", String(volumePercent));
            volumeSlider.setAttribute("aria-valuetext", `${volumePercent}%`);
            volumeSlider.style.setProperty("--volume-level", String(displayVolume));
            if (volumeFill) {
                volumeFill.style.height = `${volumePercent}%`;
            }
        }
    };

    video.defaultMuted = false;
    video.muted = false;
    video.volume = defaultVolume;
    bindVideoProgress(video);
    updateAudioState();

    if (audioToggle) {
        audioToggle.addEventListener("click", () => {
            const isMuted = video.muted || video.volume === 0;

            if (isMuted) {
                video.muted = false;
                video.volume = lastVolume || defaultVolume;
            } else {
                lastVolume = video.volume || defaultVolume;
                video.muted = true;
            }

            updateAudioState();

            if (isVisible && !document.hidden) {
                const playback = video.play();
                if (playback) {
                    playback.catch(() => {});
                }
            }
        });
        video.addEventListener("volumechange", updateAudioState);
    }

    if (volumeSlider) {
        const setVolume = (nextVolume) => {
            video.volume = Math.min(Math.max(nextVolume, 0), 1);
            video.muted = video.volume === 0;

            if (video.volume > 0) {
                lastVolume = video.volume;
            }

            updateAudioState();

            if (!video.muted && isVisible && !document.hidden) {
                const playback = video.play();
                if (playback) {
                    playback.catch(() => {});
                }
            }
        };

        const volumeFromPointer = (event) => {
            const rect = volumeSlider.getBoundingClientRect();
            const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
            return rect.height ? 1 - (y / rect.height) : defaultVolume;
        };

        volumeSlider.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            isAdjustingVolume = true;
            volumeSlider.setPointerCapture(event.pointerId);
            setVolume(volumeFromPointer(event));
        });

        volumeSlider.addEventListener("pointermove", (event) => {
            if (isAdjustingVolume) {
                setVolume(volumeFromPointer(event));
            }
        });

        const finishVolumeAdjustment = (event) => {
            isAdjustingVolume = false;
            if (event && volumeSlider.hasPointerCapture(event.pointerId)) {
                volumeSlider.releasePointerCapture(event.pointerId);
            }
        };

        volumeSlider.addEventListener("pointerup", finishVolumeAdjustment);
        volumeSlider.addEventListener("pointercancel", finishVolumeAdjustment);

        volumeSlider.addEventListener("keydown", (event) => {
            const keys = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End"];
            if (!keys.includes(event.key)) {
                return;
            }

            event.preventDefault();

            if (event.key === "Home") {
                setVolume(0);
                return;
            }

            if (event.key === "End") {
                setVolume(1);
                return;
            }

            const direction = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1;
            const currentVolume = video.muted ? 0 : video.volume;
            setVolume(currentVolume + direction * 0.05);
        });
    }

    if (prefersReducedMotion) {
        return;
    }

    const playWithFallback = () => {
        const playback = video.play();
        if (!playback) {
            return;
        }

        playback.catch(() => {
            if (video.muted) {
                return;
            }

            video.muted = true;
            updateAudioState();

            const mutedPlayback = video.play();
            if (mutedPlayback) {
                mutedPlayback.catch(() => {});
            }
        });
    };

    const setPlayback = (shouldPlay) => {
        if (!shouldPlay) {
            video.pause();
            return;
        }

        playWithFallback();
    };

    const observer = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        setPlayback(isVisible && !document.hidden);
    }, { threshold: 0.35 });

    observer.observe(video.closest(".promo-video-shell") || video);
    document.addEventListener("visibilitychange", () => {
        setPlayback(isVisible && !document.hidden);
    });
};

const setupRobotwinVideoControls = () => {
    document.querySelectorAll(".robotwin-task video").forEach((video) => {
        if (video.closest(".video-shell")) {
            return;
        }

        const shell = document.createElement("div");
        const controls = document.createElement("div");
        const playToggle = document.createElement("button");
        const currentTime = document.createElement("span");
        const progress = document.createElement("div");
        const progressFill = document.createElement("div");
        const durationTime = document.createElement("span");
        const videoLabel = video.getAttribute("aria-label") || "RoboTwin evaluation video";

        shell.className = "video-shell robotwin-video-shell";
        controls.className = "video-controls";
        playToggle.className = "video-play-toggle is-playing";
        playToggle.type = "button";
        playToggle.setAttribute("aria-label", "Pause video");
        currentTime.className = "video-time video-time-current";
        currentTime.textContent = "0:00";
        progress.className = "video-progress";
        progress.setAttribute("role", "slider");
        progress.tabIndex = 0;
        progress.setAttribute("aria-label", `${videoLabel} progress`);
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", "100");
        progress.setAttribute("aria-valuenow", "0");
        progressFill.className = "video-progress-fill";
        durationTime.className = "video-time video-time-duration";
        durationTime.textContent = "0:00";

        progress.append(progressFill);
        controls.append(playToggle, currentTime, progress, durationTime);
        video.before(shell);
        shell.append(video, controls);
        bindVideoProgress(video);
    });
};

const setupBenchChart = () => {
    const section = document.querySelector("#benchmark");
    if (!section) {
        return;
    }

    const views = {
        chart: section.querySelector("#bench-chart-wrap"),
        table: section.querySelector("#bench-table-wrap"),
    };
    const legend = section.querySelector(".bench-legend");
    const buttons = [...section.querySelectorAll("[data-bench-view]")];
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const view = button.dataset.benchView;
            buttons.forEach((other) => {
                const isActive = other === button;
                other.classList.toggle("is-active", isActive);
                other.setAttribute("aria-pressed", String(isActive));
            });
            Object.entries(views).forEach(([name, element]) => {
                element.hidden = name !== view;
            });
            legend.style.visibility = view === "chart" ? "" : "hidden";
        });
    });
};

setupTableOfContents();
setupIclFilm();
setupPromoVideo();
setupRobotwinVideoControls();
setupBenchChart();
