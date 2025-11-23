// --- SCROLL ANIMATION ---
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
};

const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
}, observerOptions);

document.querySelectorAll('.reveal').forEach(el => {
    observer.observe(el);
});

// --- DOT MATRIX CANVAS ANIMATION ---
const canvas = document.getElementById('bg-canvas');
// Check if canvas exists before proceeding (good practice for extraction)
if (canvas) {
    const ctx = canvas.getContext('2d');
    
    let width, height;
    let mouse = { x: -1000, y: -1000 };
    const dots = [];
    
    // Configuration
    const DOT_SPACING = 30; // Grid spacing
    const DOT_RADIUS = 1.5;
    const MOUSE_RADIUS = 150; // Distance of effect
    const REPEL_FORCE = 20;   // How strongly dots move away

    class Dot {
        constructor(x, y) {
            this.originX = x;
            this.originY = y;
            this.x = x;
            this.y = y;
            this.baseSize = DOT_RADIUS;
            
            // Idle animation random offsets
            this.angle = Math.random() * Math.PI * 2;
            this.speed = 0.02 + Math.random() * 0.03;
            this.range = 3; // How much they float
        }

        update() {
            // 1. Calculate Idle Floating
            this.angle += this.speed;
            let idleX = this.originX + Math.cos(this.angle) * this.range;
            let idleY = this.originY + Math.sin(this.angle) * this.range;

            // 2. Calculate Mouse Repulsion
            let dx = mouse.x - idleX;
            let dy = mouse.y - idleY;
            let distance = Math.sqrt(dx * dx + dy * dy);
            
            let forceX = 0;
            let forceY = 0;

            if (distance < MOUSE_RADIUS) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (MOUSE_RADIUS - distance) / MOUSE_RADIUS;
                // Move AWAY from mouse (negative direction)
                forceX = -forceDirectionX * force * REPEL_FORCE;
                forceY = -forceDirectionY * force * REPEL_FORCE;
            }

            // Apply forces with simple easing
            this.x += (idleX + forceX - this.x) * 0.1;
            this.y += (idleY + forceY - this.y) * 0.1;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.baseSize, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1a1a'; // var(--main-black)
            ctx.fill();
        }
    }

    function init() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        
        dots.length = 0;
        
        // Create grid of dots
        for (let x = 0; x < width + DOT_SPACING; x += DOT_SPACING) {
            for (let y = 0; y < height + DOT_SPACING; y += DOT_SPACING) {
                dots.push(new Dot(x, y));
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        dots.forEach(dot => {
            dot.update();
            dot.draw();
        });
        requestAnimationFrame(animate);
    }

    // Event Listeners
    window.addEventListener('resize', init);
    
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    // Initialize
    init();
    animate();
}

