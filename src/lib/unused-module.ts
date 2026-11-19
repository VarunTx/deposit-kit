// jsPDF imports html2canvas, DOMPurify and canvg lazily for doc.html() and SVG
// support. Deposit Kit uses neither, so they are swapped for this empty module
// in vite.config.ts to keep ~380 KB out of the app and its offline cache.
export default {}
