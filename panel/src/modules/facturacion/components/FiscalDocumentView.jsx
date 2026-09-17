import Box from "@mui/material/Box";
import { Link as RouterLink } from "react-router-dom";
import TaxBreakdown from "./TaxBreakdown";
import { DOC_TYPES, TAX_CONDITIONS } from "../lib/fiscal";
import { vatRateLabel } from "../lib/taxes";
import { formatDate, money } from "../lib/time";
import "./FiscalDocumentView.css";

/**
 * Render "documento" de un comprobante (factura / NC / ND). Emisor + receptor + líneas + impuestos,
 * más las referencias cruzadas (comprobante origen, notas asociadas, pedido).
 */
const FiscalDocumentView = ({ doc, issuer }) => {
  const typeLabel = DOC_TYPES[doc.docType]?.label || doc.docType;

  return (
    <Box className="fiscal-doc">
      <Box className="fiscal-doc__band">
        <Box className="fiscal-doc__letter">{doc.letter}</Box>
        <Box sx={{ flex: 1 }}>
          <div className="fiscal-doc__type">{typeLabel}</div>
          <div className="fiscal-doc__number mono">{doc.fullNumber}</div>
        </Box>
        <Box className="fiscal-doc__band-meta">
          <div><span className="fiscal-doc__k">Fecha</span> {formatDate(doc.issueDate)}</div>
          <div><span className="fiscal-doc__k">CAE</span> <span className="mono">{doc.cae}</span></div>
          <div><span className="fiscal-doc__k">Vto. CAE</span> {formatDate(doc.caeExpiry)}</div>
        </Box>
      </Box>

      <Box className="fiscal-doc__parties">
        <Box className="fiscal-doc__party">
          <div className="fiscal-doc__party-title">Emisor</div>
          <div className="fiscal-doc__party-name">{issuer.legalName}</div>
          <div className="fiscal-doc__party-line">CUIT {issuer.taxId} · {issuer.taxCondition}</div>
          <div className="fiscal-doc__party-line">IIBB {issuer.grossIncome} · Inicio act. {formatDate(issuer.activityStart)}</div>
          <div className="fiscal-doc__party-line">{issuer.address}</div>
        </Box>
        <Box className="fiscal-doc__party">
          <div className="fiscal-doc__party-title">Receptor</div>
          <div className="fiscal-doc__party-name">{doc.customerName}</div>
          <div className="fiscal-doc__party-line">
            {doc.customerTaxId ? `CUIT ${doc.customerTaxId}` : "Sin CUIT/CUIL"} ·{" "}
            {TAX_CONDITIONS[doc.customerTaxCondition]?.label || doc.customerTaxCondition}
          </div>
          <div className="fiscal-doc__party-line">{doc.customerAddress || "—"}</div>
        </Box>
      </Box>

      <Box className="fiscal-doc__lines-wrap">
        <table className="fiscal-doc__lines">
          <thead>
            <tr>
              <th>Detalle</th>
              <th className="ta-r">Cant.</th>
              <th className="ta-r">P. unitario</th>
              <th className="ta-r">Alícuota</th>
              <th className="ta-r">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.description}
                  {l.sku && <span className="fiscal-doc__sku mono"> · {l.sku}</span>}
                </td>
                <td className="ta-r mono">{l.qty}</td>
                <td className="ta-r mono">{money(l.unitNetPrice)}</td>
                <td className="ta-r">{vatRateLabel(l.taxRate)}</td>
                <td className="ta-r mono">{money(l.lineNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <TaxBreakdown doc={doc} />

      {(doc.relatedDoc || (doc.relatedNotes && doc.relatedNotes.length > 0) || doc.orderId) && (
        <Box className="fiscal-doc__refs">
          {doc.relatedDoc && (
            <span>
              Referencia:{" "}
              <RouterLink to={`/facturacion/${doc.relatedDoc.id}`} className="mono">
                {DOC_TYPES[doc.relatedDoc.docType]?.short} {doc.relatedDoc.letter} {doc.relatedDoc.fullNumber}
              </RouterLink>
            </span>
          )}
          {doc.relatedNotes?.map((n) => (
            <span key={n.id}>
              {DOC_TYPES[n.docType]?.label}:{" "}
              <RouterLink to={`/facturacion/${n.id}`} className="mono">{n.letter} {n.fullNumber}</RouterLink>
            </span>
          ))}
          {doc.orderId && (
            <span>
              Pedido:{" "}
              <RouterLink to={`/pedidos/${doc.orderId}`} className="mono">#{doc.orderId}</RouterLink>
            </span>
          )}
        </Box>
      )}

      {doc.reason && <Box className="fiscal-doc__reason">Motivo: {doc.reason}</Box>}
    </Box>
  );
};

export default FiscalDocumentView;
