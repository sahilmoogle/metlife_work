import { useParams } from "react-router-dom";

const LeadDetail = () => {
  const { id } = useParams();

  return <h1>Lead Detail Page - ID: {id}</h1>;
};

export default LeadDetail;