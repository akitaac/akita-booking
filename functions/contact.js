// Cloudflare Pages Function — POST /contact
// Turns the "Send Us a Message" form into a GHL contact + New Lead + note.
// GHL token comes from the Cloudflare env var GHL_TOKEN (never hardcoded — public repo).
export async function onRequestPost(context) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const TOKEN = context.env.GHL_TOKEN;
  const LOC = 'tGB0ADfB08lnqfsYJgzi';
  const LEADS_PIPE = 'I6afU8qtEfhQmCYsT22s';
  const NEW_LEAD = '4f511075-1f83-4cfe-99f6-85b191e6edf9';
  const F_LAST_AT = 'i0z7wLtlOj3VeYa7rtNM'; // "Robin Last Call At" — set so Robin's dispatcher leaves it for a human (leads-only default)
  const H = { 'Authorization': 'Bearer ' + TOKEN, 'Version': '2021-07-28', 'Content-Type': 'application/json', 'Accept': 'application/json' };
  try {
    if (!TOKEN) return new Response(JSON.stringify({ ok:false, error:'GHL_TOKEN not set' }), { status:200, headers:cors });
    const d = await context.request.json();
    const full = String(d.name || '').trim();
    const firstName = full.split(' ')[0] || '';
    const lastName = full.split(' ').slice(1).join(' ');
    const email = String(d.email || '').trim();
    const phone = String(d.phone || '').trim();
    if (!email && !phone) return new Response(JSON.stringify({ ok:false, error:'no email or phone' }), { status:200, headers:cors });
    const enquiry = String(d.enquiry || '').trim();
    const message = String(d.message || '').trim();
    const typeTag = enquiry ? ('web-' + enquiry.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')) : 'web-enquiry';

    const up = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method:'POST', headers:H,
      body: JSON.stringify({
        locationId: LOC, firstName, lastName, email, phone, country:'GB',
        source: 'Website enquiry (book.akita.ac)',
        tags: ['website-enquiry', typeTag],
        customFields: [{ id: F_LAST_AT, field_value: new Date().toISOString() }]
      })
    }).then(r => r.json());
    const contactId = (up.contact || up).id;
    if (!contactId) return new Response(JSON.stringify({ ok:false, error:'contact failed' }), { status:200, headers:cors });

    let oppId = '';
    try {
      const cr = await fetch('https://services.leadconnectorhq.com/opportunities/', {
        method:'POST', headers:H,
        body: JSON.stringify({
          pipelineId: LEADS_PIPE, locationId: LOC,
          name: (full || email || 'Website enquiry') + ' - Web enquiry' + (enquiry ? (' (' + enquiry + ')') : ''),
          pipelineStageId: NEW_LEAD, status:'open', contactId
        })
      }).then(r => r.json());
      oppId = (cr.opportunity || cr).id || '';
    } catch(e) {}

    try {
      const note = 'Website enquiry via book.akita.ac contact form\n' +
        'Type: ' + (enquiry || '-') + '\n' +
        'Phone: ' + (phone || '-') + '   Email: ' + (email || '-') + '\n' +
        (d.source ? ('Source: ' + d.source + '\n') : '') +
        'Message: ' + (message || '-');
      await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/notes', {
        method:'POST', headers:H, body: JSON.stringify({ body: note })
      });
    } catch(e) {}

    return new Response(JSON.stringify({ ok:true, contactId, oppId }), { status:200, headers:cors });
  } catch(err) {
    return new Response(JSON.stringify({ ok:false, error:String(err) }), { status:200, headers:cors });
  }
}
