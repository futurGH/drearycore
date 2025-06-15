window.onload = () => {
    const handlesTextbox = document.getElementById('handles');
    const saveButton = document.getElementById('saveButton');

    chrome.storage.sync.get('handles', (stored) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading settings:', chrome.runtime.lastError);
            return;
        }
        console.log('Loaded from storage:', stored);
        handlesTextbox.value = stored.handles ?? '';
    });

    saveButton.addEventListener('click', () => {
        const handlesValue = handlesTextbox.value;

        chrome.storage.sync.set({ handles: handlesValue }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving settings:', chrome.runtime.lastError);
            } else {
                console.log('Settings saved:\n', handlesValue);
            }
        });
    });
};
