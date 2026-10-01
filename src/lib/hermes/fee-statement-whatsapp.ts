type FeeStatementMessageDetails = {
  studentName: string;
  month: string;
  amount: string;
  url: string;
  status: string;
};

export function feeStatementWhatsAppMessage({
  studentName, month, amount, url, status,
}: FeeStatementMessageDetails) {
  const paymentSummary = status === "paid"
    ? `The total is ${amount}, and it has been marked paid`
    : `The total due is ${amount}`;
  const paymentRequest = status === "paid"
    ? ""
    : ` Please include ${studentName}'s name in the payment reference and send a screenshot once paid.`;
  return `Hi, here is ${studentName}'s fee statement for ${month}. ${paymentSummary}: ${url}${paymentRequest}`;
}
