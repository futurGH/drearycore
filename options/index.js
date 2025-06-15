import browser from 'webextension-polyfill';

window.onload = async () => {
    const handlesTextbox = document.getElementById('handles');
    const saveButton = document.getElementById('saveButton');

    try {
        const stored = await browser.storage.sync.get('handles');
        console.log('Loaded from storage:', stored);
        handlesTextbox.value = stored.handles ?? '';
    } catch (error) {
        console.error('Error loading settings:', error);
    }

    saveButton.addEventListener('click', async () => {
        try {
            const handlesValue = handlesTextbox.value;
            await browser.storage.sync.set({ handles: handlesValue });
            console.log('Settings saved');
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    });
};
