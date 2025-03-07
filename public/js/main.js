/**
 * 3D Model Manager - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', function () {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Auto-dismiss alerts
    const autoAlerts = document.querySelectorAll('.alert-auto-dismiss');
    autoAlerts.forEach(alert => {
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }, 5000);
    });

    // Model viewer loading event
    const modelViewers = document.querySelectorAll('model-viewer');
    modelViewers.forEach(viewer => {
        viewer.addEventListener('load', () => {
            console.log('Model loaded successfully');

            // Get available animations if any
            if (viewer.availableAnimations && viewer.availableAnimations.length > 0) {
                console.log('Available animations:', viewer.availableAnimations);
            }
        });

        viewer.addEventListener('error', event => {
            console.error('Error loading model:', event);
        });
    });

    // File input preview for model upload
    const modelFileInput = document.getElementById('model');
    if (modelFileInput) {
        modelFileInput.addEventListener('change', function () {
            const fileNameDisplay = document.getElementById('file-name-display');
            if (fileNameDisplay) {
                if (this.files.length > 0) {
                    const fileName = this.files[0].name;
                    const fileSize = (this.files[0].size / (1024 * 1024)).toFixed(2); // Convert to MB
                    fileNameDisplay.textContent = `${fileName} (${fileSize} MB)`;
                    fileNameDisplay.classList.remove('text-muted');
                    fileNameDisplay.classList.add('text-primary');
                } else {
                    fileNameDisplay.textContent = 'No file selected';
                    fileNameDisplay.classList.remove('text-primary');
                    fileNameDisplay.classList.add('text-muted');
                }
            }
        });
    }

    // Confirm delete actions
    const confirmDeleteForms = document.querySelectorAll('.confirm-delete-form');
    confirmDeleteForms.forEach(form => {
        form.addEventListener('submit', function (event) {
            const confirmed = confirm('Are you sure you want to delete this item? This action cannot be undone.');
            if (!confirmed) {
                event.preventDefault();
            }
        });
    });

    // Copy to clipboard functionality
    const copyButtons = document.querySelectorAll('.copy-to-clipboard');
    copyButtons.forEach(button => {
        button.addEventListener('click', function () {
            const targetId = this.getAttribute('data-copy-target');
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                // Create a temporary textarea element to copy from
                const textarea = document.createElement('textarea');
                textarea.value = targetElement.textContent || targetElement.value;
                textarea.style.position = 'fixed'; // Prevent scrolling to bottom
                document.body.appendChild(textarea);
                textarea.select();

                try {
                    const successful = document.execCommand('copy');
                    if (successful) {
                        // Update button text/icon temporarily
                        const originalHTML = this.innerHTML;
                        this.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        setTimeout(() => {
                            this.innerHTML = originalHTML;
                        }, 2000);
                    }
                } catch (err) {
                    console.error('Failed to copy text:', err);
                }

                document.body.removeChild(textarea);
            }
        });
    });

    // Handle model viewer settings in real-time
    const settingsInputs = document.querySelectorAll('[data-model-setting]');
    settingsInputs.forEach(input => {
        input.addEventListener('input', function () {
            const modelViewer = document.getElementById('modelViewer');
            if (!modelViewer) return;

            const setting = this.getAttribute('data-model-setting');
            const value = this.value;

            // Update the model viewer setting
            if (setting && modelViewer[setting] !== undefined) {
                modelViewer[setting] = value;

                // Update display value if needed
                const displayElement = document.getElementById(`${setting}_value`);
                if (displayElement) {
                    displayElement.textContent = value;
                }
            }
        });
    });

    // Responsive navigation
    const navbarToggler = document.querySelector('.navbar-toggler');
    if (navbarToggler) {
        navbarToggler.addEventListener('click', function () {
            document.body.classList.toggle('navbar-open');
        });
    }
}); 