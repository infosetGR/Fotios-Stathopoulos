// Simple script to create extension icons programmatically
// You can run this in browser console or use a tool like Canva/Figma

// Normal state icon - Blue circle with "AI" text
function createNormalIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Blue circle background
  ctx.fillStyle = '#4285f4';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, 2 * Math.PI);
  ctx.fill();
  
  // White "AI" text
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size/3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AI', size/2, size/2);
  
  return canvas.toDataURL();
}

// Working state icon - Orange circle with spinning animation indication
function createWorkingIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Orange circle background
  ctx.fillStyle = '#ff9800';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, 2 * Math.PI);
  ctx.fill();
  
  // White dots to indicate working
  ctx.fillStyle = '#ffffff';
  const dotSize = size/12;
  for(let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(size/2 - dotSize + (i * dotSize), size/2, dotSize/2, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  return canvas.toDataURL();
}

console.log('Normal icon 16px:', createNormalIcon(16));
console.log('Working icon 16px:', createWorkingIcon(16));
