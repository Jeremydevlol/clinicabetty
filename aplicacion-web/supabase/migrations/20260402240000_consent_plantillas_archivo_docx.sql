-- Modelo Word oficial por plantilla: ruta bajo el sitio (public/ en build) o URL absoluta (Storage/CDN).
alter table public.consentimiento_plantillas add column if not exists archivo_docx_url text;

comment on column public.consentimiento_plantillas.archivo_docx_url is 'Ruta al .docx servido con la web (ej. /plantillas-consentimiento/slug.docx) o URL https a Storage.';

-- Archivos copiados a aplicacion-web/public/plantillas-consentimiento/*.docx (mismos que WeTransfer).
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/acido-hialuronico.docx' where slug = 'acido-hialuronico';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/acido-polilactico.docx' where slug = 'acido-polilactico';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/carboxi.docx' where slug = 'carboxi';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/consentimiento-informado-acido-hialuronico-aesthetic.docx' where slug = 'consentimiento-informado-acido-hialuronico-aesthetic';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/corposhape.docx' where slug = 'corposhape';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/ems.docx' where slug = 'ems';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/exoxomas-dermapen-e-inyectado.docx' where slug = 'exoxomas-dermapen-e-inyectado';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/fhos-consentimiento-informado-vs-corta.docx' where slug = 'fhos-consentimiento-informado-vs-corta';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/hidrolipoclasia.docx' where slug = 'hidrolipoclasia';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/hidroxiapatita-calcica.docx' where slug = 'hidroxiapatita-calcica';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/hifu-corporal.docx' where slug = 'hifu-corporal';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/hilos.docx' where slug = 'hilos';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/ley-de-proteccion-de-datos-bs.docx' where slug = 'ley-de-proteccion-de-datos-bs';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/mesoterapia.docx' where slug = 'mesoterapia';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/radiesse.docx' where slug = 'radiesse';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/radiofrecuencia-fraccionada.docx' where slug = 'radiofrecuencia-fraccionada';
update public.consentimiento_plantillas set archivo_docx_url = '/plantillas-consentimiento/toxina-botulinica.docx' where slug = 'toxina-botulinica';
