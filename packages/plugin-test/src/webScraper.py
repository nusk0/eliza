from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from urlextract import URLExtract
import sys, getopt

def main():
    options = webdriver.EdgeOptions()
    options.add_argument("headless")
    driver = webdriver.Edge(options)

    driver.get('https://www.bing.com/')

    element = driver.find_element(By.ID, 'sb_form_q')
    element.send_keys(sys.argv[1])
    element.submit()

    driver.get(driver.current_url)
    searchElement = driver.find_element(By.ID, 'b_results')


    extractor = URLExtract()
    results = extractor.find_urls(searchElement.text)

    urls = []
    for url in results:
        if "https" in url:
            urls.append(url)

    print(urls)

if __name__ == "__main__":
    main()