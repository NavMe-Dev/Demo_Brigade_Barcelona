import { brochureLayouts } from './interior-layout.js';
export function configureEnquiry(notify) {
  const form = document.getElementById('enquiryForm'),
    dialog = document.getElementById('enquiryDialog');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim(),
      message = form.elements.message.value.trim();
    if (!name || !message) {
      notify('Enter your name and question to prepare the note.');
      return;
    }
    const code = form.dataset.layout;
    const source = (await brochureLayouts().catch(() => [])).find((row) => row.code === code);
    const detail = source
      ? 'Wing ' +
        source.wing +
        ' · Design ' +
        source.code +
        '\n' +
        source.total_sba_sqft.toLocaleString('en-IN') +
        ' sq ft total SBA · ' +
        source.total_carpet_area_sqft.toLocaleString('en-IN') +
        ' sq ft total carpet area\nBrochure page ' +
        source.source_pdf_page
      : 'Project enquiry';
    const text = [
      'BRIGADE BARCELONA',
      name,
      detail,
      message,
      'Prepared ' + new Date().toISOString().slice(0, 10),
    ].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Brigade_Barcelona_Enquiry_Draft.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    dialog.close();
    notify('Your private enquiry note has been downloaded.');
  });
}
