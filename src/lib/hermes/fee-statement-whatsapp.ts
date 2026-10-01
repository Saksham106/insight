type FeeStatementMessageDetails = {
  studentName: string;
  month: string;
  amount: string;
  url: string;
  status: string;
  nothingToPay?: boolean;
};

export function feeStatementWhatsAppMessage({
  studentName, month, amount, url, status, nothingToPay,
}: FeeStatementMessageDetails) {
  const paymentSummary = status === "paid"
    ? `The total is ${amount}, and it has been marked paid`
    : nothingToPay
      ? "The full balance is covered by a confirmed advance; nothing is due"
      : `The total due is ${amount}`;
  const paymentRequest = status === "paid" || nothingToPay
    ? ""
    : ` Please include ${studentName}'s name in the payment reference and send a screenshot once paid.`;
  return `Hi, here is ${studentName}'s fee statement for ${month}. ${paymentSummary}: ${url}${paymentRequest}`;
}
