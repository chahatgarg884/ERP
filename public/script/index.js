// Initialize GSAP
gsap.registerPlugin(ScrollTrigger);

// Navbar Mobile Menu Toggle
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('active');
});

// Smooth Scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        hamburger.classList.remove('active');
        navLinks.classList.remove('active');

        const target = document.querySelector(this.getAttribute('href'));
        window.scrollTo({
            top: target.offsetTop - 80,
            behavior: 'smooth'
        });
    });
});

// Enhanced Carousel Animation
let currentSlide = 0;
const slides = document.querySelectorAll('.slide');
const totalSlides = slides.length;

function showSlide(index) {
    // Hide all slides
    slides.forEach(slide => {
        slide.style.opacity = '0';
        slide.style.transform = 'scale(0.95)';
        slide.classList.remove('active');
    });

    // Show current slide
    slides[index].classList.add('active');
    slides[index].style.opacity = '1';
    slides[index].style.transform = 'scale(1)';

    // Animate slide content
    const content = slides[index].querySelector('.slide-content');
    gsap.fromTo(content,
        {
            opacity: 0,
            y: 30
        },
        {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: "power2.out"
        }
    );
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
    showSlide(currentSlide);
}

function previousSlide() {
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
    showSlide(currentSlide);
}

// Auto advance slides
const slideInterval = setInterval(nextSlide, 5000);

// Pause carousel on hover
const carousel = document.querySelector('.carousel');
carousel.addEventListener('mouseenter', () => clearInterval(slideInterval));
carousel.addEventListener('mouseleave', () => setInterval(nextSlide, 5000));

// Scroll Animations
// Navbar Animation
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    const navbar = document.querySelector('.navbar');

    if (currentScroll > lastScroll && currentScroll > 100) {
        navbar.style.transform = 'translateY(-100%)';
    } else {
        navbar.style.transform = 'translateY(0)';
    }
    lastScroll = currentScroll;
});

// About Section Animation
gsap.from('.about-grid', {
    scrollTrigger: {
        trigger: '.about-grid',
        start: 'top center+=100',
        toggleActions: 'play none none reverse'
    },
    opacity: 0,
    y: 50,
    duration: 1,
    stagger: 0.2
});

// Features Cards Animation
gsap.from('.feature-card', {
    scrollTrigger: {
        trigger: '.features-grid',
        start: 'top center+=100',
        toggleActions: 'play none none reverse'
    },
    opacity: 0,
    y: 50,
    duration: 0.8,
    stagger: 0.2
});

// Contact Form Animation
gsap.from('.contact-form', {
    scrollTrigger: {
        trigger: '.contact-form',
        start: 'top center+=100',
        toggleActions: 'play none none reverse'
    },
    opacity: 0,
    y: 30,
    duration: 1
});

// Section Headers Animation
gsap.utils.toArray('.section-header').forEach(header => {
    gsap.from(header, {
        scrollTrigger: {
            trigger: header,
            start: 'top center+=100',
            toggleActions: 'play none none reverse'
        },
        opacity: 0,
        y: 30,
        duration: 1
    });
});

// Feature Card Hover Animation
document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        gsap.to(card, {
            y: -10,
            duration: 0.3,
            boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
        });
    });

    card.addEventListener('mouseleave', () => {
        gsap.to(card, {
            y: 0,
            duration: 0.3,
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        });
    });
});

// Form Input Animation
const formInputs = document.querySelectorAll('.form-group input, .form-group textarea');

formInputs.forEach(input => {
    input.addEventListener('focus', () => {
        gsap.to(input.nextElementSibling, {
            y: -25,
            scale: 0.8,
            color: '#2563eb',
            duration: 0.3
        });
    });

    input.addEventListener('blur', () => {
        if (!input.value) {
            gsap.to(input.nextElementSibling, {
                y: 0,
                scale: 1,
                color: '#6b7280',
                duration: 0.3
            });
        }
    });
});

// Form Submit Animation
document.querySelector('.contact-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const button = e.target.querySelector('.submit-button');
    const originalText = button.textContent;

    // Button loading animation
    button.textContent = 'Sending...';
    gsap.to(button, {
        scale: 0.95,
        duration: 0.2
    });

    // Simulate form submission
    setTimeout(() => {
        button.textContent = 'Message Sent!';
        gsap.to(button, {
            scale: 1,
            backgroundColor: '#10B981',
            duration: 0.2
        });

        // Reset form
        setTimeout(() => {
            e.target.reset();
            button.textContent = originalText;
            gsap.to(button, {
                backgroundColor: '#2563eb',
                duration: 0.2
            });
        }, 2000);
    }, 1500);
});

// Initial animation for the first slide
showSlide(0);
