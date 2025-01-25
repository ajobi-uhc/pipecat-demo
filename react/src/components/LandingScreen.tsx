import landingImage from '../../media/landingpage.png';
import { ConnectButton } from './ConnectButton';

const LandingScreen = () => {
  return (
    <div className="landing-container">
      <div className="logo">
        <img src={landingImage} alt="RIZZTRAL" className="logo-image" />
      </div>
      <div className="connect-wrapper">
        <ConnectButton />
      </div>
    </div>
  );
};

export default LandingScreen;
