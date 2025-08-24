document.addEventListener('DOMContentLoaded', function() {
  const knotVisual = document.getElementById('knotVisual');
  
  if (knotVisual) {
    let isAnimating = false;
    
    // Animate knot on page load
    setTimeout(() => {
      knotVisual.classList.add('animate-in');
    }, 500);
    
    // Interactive knot animation
    knotVisual.addEventListener('click', function() {
      if (isAnimating) return;
      
      isAnimating = true;
      knotVisual.classList.toggle('tied');
      
      setTimeout(() => {
        isAnimating = false;
      }, 1000);
    });
  }
});