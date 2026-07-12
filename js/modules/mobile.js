export function initMobileInteractions() {
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target.closest('#invoiceCoreContainer')) return;
        if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
        if (target.type === 'submit' || target.type === 'button') return;

        e.preventDefault();

        const formElements = Array.from(
            document.querySelectorAll(
                '#invoiceCoreContainer input:not([type="hidden"]), ' +
                '#invoiceCoreContainer select, ' +
                '#invoiceCoreContainer textarea'
            )
        ).filter(el => !el.disabled && el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');

        const currentIndex = formElements.indexOf(target);

        if (currentIndex > -1 && currentIndex < formElements.length - 1) {
            formElements[currentIndex + 1].focus();
        }
    });

    document.addEventListener('focusin', function(e) {
        if (window.innerWidth < 768) {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
                setTimeout(() => { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
            }
        }
    });
}
