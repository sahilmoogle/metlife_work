import { Link } from "react-router-dom";

const Header = () => {
  return (
    <div style={{ display: "flex", gap: "20px", padding: "10px" }}>
      <Link to="/">Dashboard</Link>
      <Link to="/leads">Leads</Link>
      <Link to="/campaigns">Campaigns</Link>
      <Link to="/analytics">Analytics</Link>
      <Link to="/settings">Settings</Link>
      <Link to="/Login">Login</Link>
      
    </div>
  );
};

export default Header;