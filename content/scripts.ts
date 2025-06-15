const WATCHED_HANDLES =
    process.env.EXTENSION_PUBLIC_WATCHED_HANDLES!?.split(",");
if (!WATCHED_HANDLES) {
    throw new Error(
        "set WATCHED_HANDLES env var to comma-separated list of handles",
    );
}

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

function processPostElement(el: Element) {
    if ((el as HTMLElement).dataset.chipsInjected === "true") {
        return;
    }

    const testId = el.getAttribute("data-testid");
    if (!testId) return;

    const byIndex = testId.indexOf("by-");
    if (byIndex === -1) return;

    const handle = testId.substring(byIndex + 3);

    if (!WATCHED_HANDLES.includes(handle)) {
        return;
    }

    const thumbnailImgs = [
        ...el.querySelectorAll<HTMLImageElement>('img[src*="feed_thumbnail"]'),
    ].filter((img) => !!img.alt);
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

function scanForPosts() {
    const posts = document.querySelectorAll(
        'div[data-testid^="feedItem-by-"], div[data-testid^="postThreadItem-by-"]',
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
