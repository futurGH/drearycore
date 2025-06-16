let WATCHED_HANDLES: string[] = [];

function updateWatchedHandles(): void {
    chrome.storage.sync.get('handles', (stored) => {
        const raw = stored?.handles;
        WATCHED_HANDLES = typeof raw === 'string'
            ? raw.split('\n').map(h => h.trim()).filter(Boolean)
            : [];
    });
}

updateWatchedHandles();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.handles) {
        updateWatchedHandles();
    }
});

let unmount: () => void;

if (import.meta.webpackHot) {
    import.meta.webpackHot?.accept();
    import.meta.webpackHot?.dispose(() => unmount?.());
}

function isBlueskyLikeSite(): boolean {
    const preconnectLink = document.querySelector(
        'link[rel="preconnect"][href="https://bsky.social"]',
    );
    if (preconnectLink) return true;

    const url = location.href;
    return url.includes("did:plc") || url.includes("did:web");
}

function extractUrlsFromAlt(alt: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return alt.match(urlRegex) || [];
}

function createChipsContainer(urls: string[]): HTMLElement {
    const container = document.createElement("div");
    container.className = "willow__chips-container";

    const urlsByHostname = urls.reduce(
        (acc, url) => {
            const hostname = new URL(url).hostname;
            (acc[hostname] ??= []).push(url);
            return acc;
        },
        {} as Record<string, string[]>,
    );

    Object.entries(urlsByHostname).forEach(([hostname, urls]) => {
        urls.forEach((url) => {
            const pathname = new URL(url).pathname;
            try {
                const chip = document.createElement("a");
                chip.className = "willow__chip";
                chip.href = url;
                chip.target = "_blank";
                chip.rel = "noopener noreferrer";
                chip.textContent =
                    urls.length === 1 ? hostname : `${hostname}${pathname}`;

                chip.addEventListener("click", (event) => {
                    event.stopPropagation();
                });

                container.appendChild(chip);
            } catch (e) {}
        });
    });

    return container;
}

function processVideoElement(el: Element) {
    const videoContainer = [...el.querySelectorAll<HTMLElement>(
        'div[aria-label="Embedded video player"]'
    )].find(vid => {
        const quoteContainer = vid.closest('div[aria-label^="Post by "]');
        return !quoteContainer || quoteContainer === el
    });

    if (!videoContainer) {
        const hasVideo = el.querySelector("div[style*='top: calc(50% - 50vh)']");
        if (hasVideo) {
            const observer = new MutationObserver(() => {
                processVideoElement(el);
                observer.disconnect();
            });
            observer.observe(el, {
                attributes: true,
                childList: true,
                subtree: true,
            });
        }
        return;
    }

    const altText = videoContainer.querySelector('figcaption')?.textContent
    if (!altText) return;

    const urls = [...new Set(extractUrlsFromAlt(altText))];
    if (urls.length === 0) return;

    const chipsContainer = createChipsContainer(urls);

    let insertionPoint: Element | null = videoContainer?.parentElement;
    while (
        insertionPoint?.parentElement?.children.length === 1 &&
        insertionPoint.parentElement.parentElement
    ) {
        insertionPoint = insertionPoint.parentElement;
    }

    if (insertionPoint) {
        insertionPoint.insertAdjacentElement("afterend", chipsContainer);
        (el as HTMLElement).dataset.chipsInjected = "true";
    }
}

function processGIFElement(el: Element) {
    const gif = [...el.querySelectorAll<HTMLVideoElement>(
        'video[src^="https://t.gifs.bsky.app/"][aria-label]'
    )].find(g => {
        const quoteContainer = g.closest('div[aria-label^="Post by "]');
        return !quoteContainer || quoteContainer === el
    });
    if (!gif) return;

    const altText = gif.getAttribute("aria-label")
    if (!altText) return;

    const urls = [...new Set(extractUrlsFromAlt(altText))];
    if (urls.length === 0) return;

    const chipsContainer = createChipsContainer(urls);

    let insertionPoint: Element | null = gif?.parentElement;
    while (
        insertionPoint?.parentElement?.children.length === 1 &&
        insertionPoint.parentElement.parentElement
    ) {
        insertionPoint = insertionPoint.parentElement;
    }

    if (insertionPoint) {
        insertionPoint.insertAdjacentElement("afterend", chipsContainer);
        (el as HTMLElement).dataset.chipsInjected = "true";
    }
}

function processImageElement(el: Element) {
    const thumbnailImgs = [
        ...el.querySelectorAll<HTMLImageElement>('img[src*="feed_thumbnail"]'),
    ].filter(img => {
            if (!img.alt) return false; 
            const quoteContainer = img.closest('div[aria-label^="Post by "]')
            return !quoteContainer || quoteContainer === el
        }
    );

    if (thumbnailImgs.length === 0) {
        const container = el.querySelector("div[data-expoimage='true']");
        if (container) {
            const observer = new MutationObserver(() => {
                processPostElement(el);
                observer.disconnect();
            });
            observer.observe(container, {
                attributes: true,
                childList: true,
                subtree: true,
            });
        }
        return;
    }

    const urls = [...new Set(
        thumbnailImgs.flatMap(img => extractUrlsFromAlt(img.alt))
    )];
    if (urls.length === 0) {
        return;
    }

    const chipsContainer = createChipsContainer(urls);

    let imageContainer: Element | null = null
    for (const thumbnailImg of thumbnailImgs) {
        imageContainer = thumbnailImg.closest(
            `div[aria-label*="${urls[0]}"]`,
        );
        if (!imageContainer) {
            imageContainer = thumbnailImg.closest(
                `button[aria-label*="${urls[0]}"]`,
            )?.parentElement?.parentElement?.parentElement ?? null;
        };
        if (imageContainer) {
            break
        };
    }

    let insertionPoint: Element | null = imageContainer;
    while (
        insertionPoint?.parentElement?.children.length === 1 &&
        insertionPoint.parentElement.parentElement
    ) {
        insertionPoint = insertionPoint.parentElement;
    }

    if (insertionPoint) {
        insertionPoint.insertAdjacentElement("afterend", chipsContainer);
        (el as HTMLElement).dataset.chipsInjected = "true";
    }
}

function extractHandle(el: Element): string | undefined {
    const testId = el.getAttribute("data-testid");
    if (testId) {
        const byIndex = testId.indexOf("by-");
        if (byIndex !== -1) {
            return testId.substring(byIndex + 3);
        }
    }

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
        const postByIndex = ariaLabel.indexOf("Post by ");
        if (postByIndex !== -1) {
            return ariaLabel.substring(postByIndex + 8);
        }
    }

    return undefined
}

function processPostElement(el: Element) {
    if ((el as HTMLElement).dataset.chipsInjected === "true") {
        return;
    }

    const handle = extractHandle(el);
    if (!handle) return;

    if (!WATCHED_HANDLES.includes(handle)) {
        return;
    }

    processGIFElement(el);
    processImageElement(el);
    processVideoElement(el);
}

function scanForPosts() {
    const posts = document.querySelectorAll(
        'div[data-testid^="feedItem-by-"], ' +
        'div[data-testid^="postThreadItem-by-"], ' +
        'div[aria-label^="Post by "]'
    );
    posts.forEach(processPostElement);
}

async function injectChipsCSS() {
    try {
        const cssUrl = new URL("./chips.css", import.meta.url);
        const response = await fetch(cssUrl);
        const cssText = await response.text();

        if (response.ok) {
            const style = document.createElement("style");
            style.textContent = cssText;
            document.head.appendChild(style);
        }
    } catch (e) {
        console.warn("Failed to load chips CSS:", e);
    }
}

function initializeExtension() {
    void injectChipsCSS();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as Element;

                    const testId = element.getAttribute("data-testid");
                    if (
                        testId &&
                        (testId.startsWith("feedItem-by-") ||
                            testId.startsWith("postThreadItem-by-"))
                    ) {
                        processPostElement(element);
                    }

                    const childPosts = element.querySelectorAll(
                        'div[data-testid^="feedItem-by-"], div[data-testid^="postThreadItem-by-"]',
                    );
                    childPosts.forEach(processPostElement);

                    const quotePosts = element.querySelectorAll(
                        'div[aria-label^="Post by "]'
                    );
                    quotePosts.forEach(processPostElement);
                }
            });
        });
    });

    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
    });

    scanForPosts();

    return () => {
        observer.disconnect();
    };
}

if (isBlueskyLikeSite()) {
    if (document.readyState === "complete") {
        unmount = initializeExtension() || (() => {});
    } else {
        document.addEventListener("readystatechange", () => {
            if (document.readyState === "complete") {
                unmount = initializeExtension() || (() => {});
            }
        });
    }
}